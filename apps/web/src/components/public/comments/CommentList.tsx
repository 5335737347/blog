import { formatDate } from "@/lib/utils";
import type { CommentWithReplies } from "@kpblog/contracts";

function CommentAvatar({ author }: { author: string }) {
  const colors = [
    "from-pink-400 to-rose-400",
    "from-purple-400 to-violet-400",
    "from-sky-400 to-cyan-400",
    "from-emerald-400 to-teal-400",
    "from-amber-400 to-orange-400",
  ];
  const idx = author.charCodeAt(0) % colors.length;
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${colors[idx]} text-sm font-bold text-white shadow-sm`}
      aria-label={author}
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
    <div className={depth > 0 ? "ml-6 border-l-2 border-pink-200 pl-4 dark:border-purple-800" : ""}>
      <div className="mb-4">
        <div className="mb-2 flex items-start gap-3">
          <CommentAvatar author={comment.author} />
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2 text-sm">
              <span className="font-medium text-purple-900 dark:text-purple-100">
                {comment.author}
              </span>
              <span className="text-pink-300 dark:text-purple-600">·</span>
              <time className="text-pink-300 dark:text-purple-600">
                {formatDate(comment.createdAt)}
              </time>
            </div>
            <p className="text-sm text-purple-700 dark:text-purple-300 whitespace-pre-wrap">
              {comment.content}
            </p>
            {depth === 0 && (
              <button
                onClick={() =>
                  onReply(replyingTo === comment.id ? "" : comment.id)
                }
                className="mt-1 text-xs text-pink-400 hover:text-purple-500 dark:text-purple-400 dark:hover:text-pink-400 transition-colors"
              >
                {replyingTo === comment.id ? "取消回复" : "💬 回复"}
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
