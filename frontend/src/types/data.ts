export type DatasetValue = string | number | boolean | null;

export interface ColumnSchema {
  name: string;
  type: string;
}

export interface PreviewRow {
  [columnName: string]: DatasetValue;
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  row_count: number;
  preview: PreviewRow[];
}

export interface UploadDatasetResponse {
  session_id: string;
  tables: TableSchema[];
  preview: Record<string, PreviewRow[]>;
  truncated?: boolean;
}

export interface AskRequest {
  session_id: string;
  question: string;
}

export interface AskResponse {
  columns: string[];
  rows: PreviewRow[];
  sql: string;
  explanation: string;
  is_empty: boolean;
  truncated?: boolean;
}

export type ChatMessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: number;
  sql?: string;
  columns?: string[];
  rows?: PreviewRow[];
  isEmpty?: boolean;
  truncated?: boolean;
  error?: boolean;
}
