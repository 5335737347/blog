import type { Prisma } from "@prisma/client";

export const musicTrackSelect = {
  id: true,
  title: true,
  artist: true,
  url: true,
  createdAt: true,
} satisfies Prisma.MusicSelect;

type MusicTrackRecord = Prisma.MusicGetPayload<{ select: typeof musicTrackSelect }>;

export function toMusicTrackDto(track: MusicTrackRecord) {
  return {
    ...track,
    createdAt: track.createdAt.toISOString(),
  };
}

export type MusicTrackDto = ReturnType<typeof toMusicTrackDto>;
