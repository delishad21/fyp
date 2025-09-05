export type CellVariant = "normal" | "label" | "tags" | "progressbar" | "date";

export type NormalCell = {
  variant: "normal";
  data: { text: string; bold?: boolean; color?: string };
};

export type LabelCell = {
  variant: "label";
  data: { text: string; dotColor?: string; textColor?: string; bold?: boolean };
};

export type TagsCell = {
  variant: "tags";
  data: { tags: Array<{ tag: string; color?: string; bold?: boolean }> };
};

export type ProgressBarCell = {
  variant: "progressbar";
  data: {
    current: number;
    total: number;
    barColor?: string;
    textColor?: string;
  };
};

export type DateCell = {
  variant: "date";
  data: { iso: string | Date; format?: string; color?: string }; // <- Date allowed
};

export type Cell =
  | NormalCell
  | LabelCell
  | TagsCell
  | ProgressBarCell
  | DateCell;

export type RowData = {
  id: string;
  cells: Cell[]; // must align with columns order
};

export type ColumnDef = {
  header: string;
  width?: number; // fractional width e.g. 2 = 2fr
  align?: "left" | "center" | "right";
};

export type TablePayload = {
  columns: ColumnDef[];
  rows: RowData[];
};

// Query Types

// query shape the backend expects
export type Query = {
  page: number; // 1-based
  pageSize: number; // always 10
  name?: string;
  subjects?: string[];
  topics?: string[];
  types?: string[];
  createdStart?: string; // 'YYYY-MM-DD' (inclusive)
  createdEnd?: string; // 'YYYY-MM-DD' (inclusive)
};

// server response
export type QueryResult = {
  rows: RowData[]; // Variant-driven row cells
  page: number;
  pageCount: number;
  total: number; // if you want to show it later
};

export type FilterOption = {
  value: string;
  label: string;
  colorHex?: string;
};

export type FilterMeta = {
  subjects: FilterOption[];
  topics: FilterOption[];
  types: FilterOption[];
};

export type InitialPayload = {
  rows: RowData[];
  page: number;
  pageCount: number;
  pageSize: number;
  meta: FilterMeta;
  query: {
    page: number;
    pageSize: number;
    name?: string;
    subjects?: string[];
    topics?: string[];
    types?: string[];
    createdStart?: string;
    createdEnd?: string;
  };
};
