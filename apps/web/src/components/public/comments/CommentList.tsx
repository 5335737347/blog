import { formatDate } from "@/lib/utils";
import type { CommentWithReplies } from "@kpblog/contracts";

function CommentAvatar({ author }: { author: string }) {
  // 头像配色只在品牌粉蓝两色内交替：既能区分发言人，又不引入第三套色系。
  const tones = ["bg-primary-solid", "bg-accent-solid"];
  const idx = author.charCodeAt(0) % tones.length;
  return (
    // 头像是纯装饰：作者名就在旁边的文本里，用 `aria-hidden` 让屏幕阅读器跳过，
    // 而不是在无角色的 div 上写 aria-label（那不会产生可访问名称，属于无效 ARIA）。
    <div
      aria-hidden="true"
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tones[idx]} text-meta font-bold text-on-solid`}
    >
      {author.charAt(0).toUpperCase()}
    </div>
  );
}

interface CommentListProps {
  comments: CommentWithReplies[];
  onReply: (commentId: string) => void;
  replyingTo: string | null;
}

function CommentItem({
  comment,
  onReply,
  replyingTo,
  depth = 0,
}: {
  comment: CommentWithReplies;
  onReply: (commentId: string) => void;
  replyingTo: string | null;
  depth?: number;
}) {
  return (
    <div className={depth > 0 ? "ml-5 border-l border-line pl-4" : ""}>
      <div className="mb-4">
        <div className="mb-2 flex items-start gap-3">
          <CommentAvatar author={comment.author} />
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2 text-meta">
              <span className="font-medium text-ink">
                {comment.author}
              </span>
              <span aria-hidden="true" className="text-ink-4">·</span>
              <time className="text-ink-3">
                {formatDate(comment.createdAt)}
              </time>
            </div>
            <p className="whitespace-pre-wrap text-ui leading-relaxed text-ink-2">
              {comment.content}
            </p>
            {depth === 0 && (
              <button
                onClick={() =>
                  onReply(replyingTo === comment.id ? "" : comment.id)
                }
                className="mt-1 text-micro font-medium text-ink-3 transition-colors hover:text-primary-deep"
              >
                {replyingTo === comment.id ? "取消回复" : "回复"}
              </button>
            )}
          </div>
        </div>
      </div>
      {comment.replies?.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          onReply={onReply}
          replyingTo={replyingTo}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

export default function CommentList({
  comments,
  onReply,
  replyingTo,
}: CommentListProps) {
  if (comments.length === 0) {
    return null;
  }

  return (
    <div>
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          onReply={onReply}
          replyingTo={replyingTo}
        />
      ))}
    </div>
  );
}
