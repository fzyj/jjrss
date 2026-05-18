export interface Feed {
  id: number;
  url: string;
  title: string;
  description: string | null;
  link: string | null;
  category_id: number | null;
  last_fetched_at: string | null;
  error_count: number;
  created_at: string;
}

export interface FeedWithCount extends Feed {
  unread_count: number;
}

export interface Article {
  id: number;
  feed_id: number;
  guid: string;
  title: string;
  url: string;
  summary: string | null;
  full_content: string | null;
  author: string | null;
  published_at: string | null;
  is_read: number;
  is_starred: number;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number;
}

export interface ArticleListParams {
  feed_id?: number;
  category_id?: number;
  starred?: boolean;
  page?: number;
  page_size?: number;
}
