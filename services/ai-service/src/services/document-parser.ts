import pdf from "pdf-parse";
import mammoth from "mammoth";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const OCR_MIN_TOTAL_WORDS = 40;
const OCR_MIN_WORDS_PER_PAGE = 12;
const OCR_LOW_WORD_PAGE_THRESHOLD = 10;
const OCR_LOW_WORD_PAGE_RATIO_TRIGGER = 1 / 2;
const OCR_MAX_PAGES = 30;
const OCR_LANGUAGE = "eng";
const OCR_PAGE_SEG_MODE = "6";

export interface ParsedDocument {
  text: string;
  metadata: {
    pageCount?: number;
    wordCount: number;
    charCount: number;
    ocrApplied?: boolean;
  };
}

export class DocumentParserService {
  private ocrDependencyCheckDone = false;
  private hasPdfToPpm = false;
  private hasTesseract = false;

  /**
   * Parse document based on file type
   */
  async parseDocument(
    filePath: string,
    mimetype: string,
  ): Promise<ParsedDocument> {
    const ext = path.extname(filePath).toLowerCase();

    try {
      if (mimetype.includes("pdf") || ext === ".pdf") {
        return await this.parsePDF(filePath);
      } else if (mimetype.includes("wordprocessingml") || ext === ".docx") {
        return await this.parseDOCX(filePath);
      } else if (mimetype.includes("text/plain") || ext === ".txt") {
        return await this.parseTXT(filePath);
      } else {
        throw new Error(`Unsupported file type: ${mimetype}`);
      }
    } catch (error) {
      console.error("Document parsing error:", error);
      throw new Error(
        `Failed to parse document: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Parse PDF document
   */
  private async parsePDF(filePath: string): Promise<ParsedDocument> {
    const dataBuffer = await fs.readFile(filePath);
    const pageWordCounts: number[] = [];
    const data = await pdf(dataBuffer, {
      pagerender: async (pageData: any) => {
        const textContent = await pageData.getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false,
        });

        let lastY: number | undefined;
        let pageText = "";
        for (const item of textContent.items as Array<any>) {
          if (lastY === item.transform[5] || !lastY) {
            pageText += item.str;
          } else {
            pageText += `\n${item.str}`;
          }
          lastY = item.transform[5];
        }

        const cleanedPageText = this.cleanText(pageText);
        pageWordCounts.push(this.countWords(cleanedPageText));
        return pageText;
      },
    });

    const extractedText = this.cleanText(data.text);
    const extractedWordCount = this.countWords(extractedText);
    const pageCount = Math.max(1, data.numpages || 1);
    let finalText = extractedText;
    let ocrApplied = false;

    const lowTextTrigger = this.shouldAttemptOcr(extractedWordCount, pageCount);
    const lowWordPageStats = this.getLowWordPageStats(
      pageWordCounts,
      pageCount,
    );
    const sparsePageTrigger =
      lowWordPageStats.lowWordPageRatio > OCR_LOW_WORD_PAGE_RATIO_TRIGGER;

    if (lowTextTrigger || sparsePageTrigger) {
      if (sparsePageTrigger) {
        console.log(
          `[DocumentParser] OCR trigger (sparse pages) for ${path.basename(filePath)}: lowWordPages=${lowWordPageStats.lowWordPageCount}/${lowWordPageStats.totalPages} (${(lowWordPageStats.lowWordPageRatio * 100).toFixed(1)}%) with threshold <${OCR_LOW_WORD_PAGE_THRESHOLD} words/page`,
        );
      }
      const ocrText = await this.tryOcrPdf(filePath, pageCount);
      if (ocrText) {
        const cleanedOcr = this.cleanText(ocrText);
        const ocrWordCount = this.countWords(cleanedOcr);

        // Use OCR output only if it improves extracted coverage.
        if (ocrWordCount > extractedWordCount) {
          finalText = cleanedOcr;
          ocrApplied = true;
          console.log(
            `[DocumentParser] OCR applied for ${path.basename(filePath)} (${pageCount} pages): extracted=${extractedWordCount} words, ocr=${ocrWordCount} words`,
          );
        }
      }
    }

    return {
      text: finalText,
      metadata: {
        pageCount: data.numpages,
        wordCount: this.countWords(finalText),
        charCount: finalText.length,
        ocrApplied,
      },
    };
  }

  private shouldAttemptOcr(wordCount: number, pageCount: number): boolean {
    if (wordCount <= 0) return true;
    const wordsPerPage = wordCount / Math.max(1, pageCount);
    return (
      wordCount < OCR_MIN_TOTAL_WORDS || wordsPerPage < OCR_MIN_WORDS_PER_PAGE
    );
  }

  private getLowWordPageStats(
    pageWordCounts: number[],
    fallbackPageCount: number,
  ): {
    totalPages: number;
    lowWordPageCount: number;
    lowWordPageRatio: number;
  } {
    const totalPages =
      pageWordCounts.length > 0
        ? pageWordCounts.length
        : Math.max(1, fallbackPageCount);
    const lowWordPageCount =
      pageWordCounts.length > 0
        ? pageWordCounts.filter((count) => count < OCR_LOW_WORD_PAGE_THRESHOLD)
            .length
        : 0;

    return {
      totalPages,
      lowWordPageCount,
      lowWordPageRatio: lowWordPageCount / Math.max(1, totalPages),
    };
  }

  private async tryOcrPdf(
    filePath: string,
    detectedPageCount: number,
  ): Promise<string | null> {
    const depsReady = await this.ensureOcrDependencies();
    if (!depsReady) {
      return null;
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-pdf-ocr-"));
    const outputBase = path.join(tempDir, "page");
    const maxPagesToProcess =
      detectedPageCount > 0
        ? Math.min(detectedPageCount, OCR_MAX_PAGES)
        : OCR_MAX_PAGES;

    try {
      await execFileAsync("pdftoppm", [
        "-f",
        "1",
        "-l",
        String(maxPagesToProcess),
        "-png",
        filePath,
        outputBase,
      ]);

      const renderedFiles = (await fs.readdir(tempDir))
        .filter((name) => /^page-\d+\.png$/i.test(name))
        .sort((a, b) => {
          const aNum = parseInt(a.match(/\d+/)?.[0] || "0", 10);
          const bNum = parseInt(b.match(/\d+/)?.[0] || "0", 10);
          return aNum - bNum;
        });

      if (renderedFiles.length === 0) {
        return null;
      }

      const ocrChunks: string[] = [];

      for (const imageName of renderedFiles) {
        const imagePath = path.join(tempDir, imageName);
        try {
          const { stdout } = await execFileAsync("tesseract", [
            imagePath,
            "stdout",
            "-l",
            OCR_LANGUAGE,
            "--psm",
            OCR_PAGE_SEG_MODE,
          ]);

          if (stdout?.trim()) {
            ocrChunks.push(stdout);
          }
        } catch (error) {
          console.warn(
            `[DocumentParser] OCR failed for page ${imageName}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      if (ocrChunks.length === 0) {
        return null;
      }

      return ocrChunks.join("\n\n");
    } catch (error) {
      console.warn(
        "[DocumentParser] OCR fallback failed for PDF:",
        error instanceof Error ? error.message : error,
      );
      return null;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  private async ensureOcrDependencies(): Promise<boolean> {
    if (this.ocrDependencyCheckDone) {
      return this.hasPdfToPpm && this.hasTesseract;
    }

    this.ocrDependencyCheckDone = true;
    this.hasPdfToPpm = await this.commandExists("pdftoppm");
    this.hasTesseract = await this.commandExists("tesseract");

    if (!this.hasPdfToPpm || !this.hasTesseract) {
      console.warn(
        "[DocumentParser] OCR fallback disabled at runtime: missing pdftoppm and/or tesseract binaries",
      );
    }

    return this.hasPdfToPpm && this.hasTesseract;
  }

  private async commandExists(command: string): Promise<boolean> {
    try {
      await execFileAsync("sh", ["-lc", `command -v ${command}`]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse DOCX document
   */
  private async parseDOCX(filePath: string): Promise<ParsedDocument> {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = this.cleanText(result.value);

    return {
      text,
      metadata: {
        wordCount: this.countWords(text),
        charCount: text.length,
      },
    };
  }

  /**
   * Parse TXT document
   */
  private async parseTXT(filePath: string): Promise<ParsedDocument> {
    const buffer = await fs.readFile(filePath);
    const text = this.cleanText(buffer.toString("utf-8"));

    return {
      text,
      metadata: {
        wordCount: this.countWords(text),
        charCount: text.length,
      },
    };
  }

  /**
   * Clean extracted text
   */
  private cleanText(text: string): string {
    return (
      text
        // Remove excessive whitespace
        .replace(/\s+/g, " ")
        // Remove control characters
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        // Normalize line breaks
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        // Remove multiple consecutive newlines
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    );
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter((word) => word.length > 0).length;
  }

  /**
   * Split document into chunks for parallel processing
   */
  splitIntoChunks(text: string, numChunks: number): string[] {
    // Split by paragraphs or sentences for more coherent chunks
    const paragraphs = text.split(/\n\n+/);

    if (paragraphs.length <= numChunks) {
      // If fewer paragraphs than chunks, combine multiple paragraphs per chunk
      const chunkSize = Math.ceil(paragraphs.length / numChunks);
      const chunks: string[] = [];

      for (let i = 0; i < paragraphs.length; i += chunkSize) {
        chunks.push(paragraphs.slice(i, i + chunkSize).join("\n\n"));
      }

      return chunks.filter((chunk) => chunk.trim().length > 0);
    }

    // Distribute paragraphs across chunks
    const chunksPerParagraph = Math.ceil(paragraphs.length / numChunks);
    const chunks: string[] = [];

    for (let i = 0; i < numChunks; i++) {
      const start = i * chunksPerParagraph;
      const end = Math.min(start + chunksPerParagraph, paragraphs.length);
      const chunk = paragraphs.slice(start, end).join("\n\n");

      if (chunk.trim().length > 0) {
        chunks.push(chunk);
      }
    }

    return chunks;
  }

  /**
   * Extract potential topics from text
   */
  extractTopics(text: string): string[] {
    // Simple topic extraction
    const lines = text.split("\n");
    const topics: string[] = [];

    // Look for chapter headings, section titles, etc.
    const headingPatterns = [
      /^chapter\s+\d+:?\s+(.+)$/i,
      /^section\s+\d+:?\s+(.+)$/i,
      /^\d+\.\s+(.+)$/,
      /^[A-Z][A-Z\s]{3,}$/, // ALL CAPS headings
    ];

    for (const line of lines) {
      const trimmed = line.trim();

      for (const pattern of headingPatterns) {
        const match = trimmed.match(pattern);
        if (match) {
          topics.push(match[1] || match[0]);
          break;
        }
      }
    }

    return topics.slice(0, 10); // Return top 10 topics
  }
}
