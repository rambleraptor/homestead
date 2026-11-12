export type BookmarkVisibility = 'household' | 'private';
export type BookmarkStatus = 'pending' | 'ready' | 'failed';
export type BookmarkKind = 'article' | 'video' | 'pdf' | 'page';

export interface Bookmark {
  id: string;
  /** AEP-122 resource name: `bookmarks/{id}`. */
  path: string;
  url: string;
  visibility?: BookmarkVisibility;
  title?: string;
  site_name?: string;
  author?: string;
  excerpt?: string;
  image_url?: string;
  kind?: BookmarkKind;
  tags?: string[];
  read?: boolean;
  favorite?: boolean;
  /** When it was saved, by the saver's clock. */
  saved_at?: string;
  status?: BookmarkStatus;
  fetch_error?: string;
  /** `users/{id}` of whoever saved it. */
  created_by?: string;
  create_time: string;
  update_time: string;
}

export interface BookmarkFormData {
  url: string;
  visibility?: BookmarkVisibility;
  title?: string;
  tags?: string[];
  read?: boolean;
  favorite?: boolean;
  saved_at?: string;
  status?: BookmarkStatus;
}

/** The readable copy of a bookmark's page (`bookmarks/{id}/pages/reader`). */
export interface BookmarkPage {
  id: string;
  path: string;
  content?: string;
  word_count?: number;
  source_url?: string;
  create_time: string;
  update_time: string;
}
