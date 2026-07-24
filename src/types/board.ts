// 2026-07-24 추가 (게시판 기능)
// BE dto/response의 PostSummaryDto/PostDetailDto/AttachmentDto/PageResponseDto/
// PostListResponseDto와 필드명을 그대로 맞춤(camelCase 기준).

export interface Attachment {
  attachmentId: number;
  originalName: string;
  fileSize: number;
  contentType: string | null;
}

export interface PostSummary {
  postId: number;
  title: string;
  writerName: string;
  marketCode: string | null;
  categoryCode: string;
  notice: boolean;
  viewCount: number;
  likeCount: number;
  attachmentCount: number;
  createdAt: string;
}

export interface PostDetail {
  postId: number;
  title: string;
  content: string;
  writerId: number;
  writerName: string;
  marketCode: string | null;
  categoryCode: string;
  notice: boolean;
  viewCount: number;
  likeCount: number;
  liked: boolean;
  canEdit: boolean;
  canDelete: boolean;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string | null;
}

export interface PageResponse<T> {
  content: T[];
  page: number; // 0-base
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface PostListResponse {
  pinned: PostSummary[];
  page: PageResponse<PostSummary>;
}
