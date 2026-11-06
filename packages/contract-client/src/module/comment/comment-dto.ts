type CommentSummary = {
  id: string;
  name: string;
  content: string;
};

type CommentPartialFetch<T> = {
  found: T[];
  missingIds: string[];
};

export type { CommentSummary, CommentPartialFetch };
