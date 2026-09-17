import type { Metadata } from "next";
import Image from "next/image";
import PageShell, { PageHeader } from "@/components/public/layout/PageShell";
import { MailIcon, ProfileIcon } from "@/components/public/layout/SiteIcons";
import { getProfile } from "@/lib/api/public-api";
import { getSiteUrl } from "@/lib/env";
import { shouldSkipImageOptimization } from "@/lib/images";

export function generateMetadata(): Metadata {
  const siteUrl = getSiteUrl();
  return {
    title: "关于",
    description: "关于本站与作者",
    alternates: { canonical: `${siteUrl}/about` },
  };
}

interface MetaRow {
  icon: typeof MailIcon;
  label: string;
  value: string;
  href?: string;
}

export default async function AboutPage() {
  const profile = await getProfile();

  const meta: MetaRow[] = [
    profile.location
      ? { icon: ProfileIcon, label: "所在地", value: profile.location }
      : null,
    profile.email
      ? { icon: MailIcon, label: "邮箱", value: profile.email, href: `mailto:${profile.email}` }
      : null,
  ].filter((row): row is MetaRow => row !== null);

  // 只有昵称、简介、社交链接全为空时才视为「尚未填写」。
  const isBlank =
    !profile.name &&
    !profile.headline &&
    !profile.bio &&
    !profile.avatar &&
    meta.length === 0 &&
    profile.socialLinks.length === 0;

  return (
    <PageShell narrow>
      <PageHeader kicker="About" title={profile.headline || "关于这里"} />

      {isBlank ? (
        <div className="empty-state">关于内容尚未添加。</div>
      ) : (
        <article>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {profile.avatar && (
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-line">
                <Image
                  src={profile.avatar}
                  alt={profile.name || "头像"}
                  fill
                  sizes="80px"
                  className="object-cover"
                  unoptimized={shouldSkipImageOptimization(profile.avatar)}
                />
              </div>
            )}
            {(profile.name || meta.length > 0) && (
              <div className="min-w-0">
                {profile.name && (
                  <p className="text-xl font-semibold text-ink">{profile.name}</p>
                )}
                {meta.length > 0 && (
                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-meta text-ink-3">
                    {meta.map((row) => {
                      const Icon = row.icon;
                      return (
                        <div key={row.label} className="flex items-center gap-1.5">
                          <dt className="sr-only">{row.label}</dt>
                          <Icon className="h-3.5 w-3.5 text-ink-4" />
                          <dd>
                            {row.href ? (
                              <a
                                href={row.href}
                                className="transition-colors hover:text-primary-deep"
                              >
                                {row.value}
                              </a>
                            ) : (
                              row.value
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
              </div>
            )}
          </div>

          {profile.bio && (
            <div className="reading mt-8 whitespace-pre-line">
              {profile.bio
                .split("\n")
                .filter((line) => line.trim())
                .map((line, index) => (
                  <p key={index}>{line}</p>
                ))}
            </div>
          )}

          {profile.socialLinks.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2.5">
              {profile.socialLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="btn btn-secondary"
                  target="_blank"
                  rel="noreferrer"
                >
                  {link.label}
                </a>
              ))}
            </div>
          )}
        </article>
      )}
    </PageShell>
  );
}
