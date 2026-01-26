import pdf from "pdf-parse";
import mammoth from "mammoth";
import fs from "fs/promises";
import path from "path";

export interface ParsedDocument {
  text: string;
  metadata: {
    pageCount?: number;
    wordCount: number;
    charCount: number;
  };
}

export class DocumentParserService {
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
    const data = await pdf(dataBuffer);

    const text = this.cleanText(data.text);

    return {
      text,
      metadata: {
        pageCount: data.numpages,
        wordCount: this.countWords(text),
        charCount: text.length,
      },
    };
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
