import type { Prisma } from "@prisma/client";
import type { MusicTrackDto } from "@kpblog/contracts";

export const musicTrackSelect = {
  id: true,
  title: true,
  artist: true,
  url: true,
  createdAt: true,
} satisfies Prisma.MusicSelect;

type MusicTrackRecord = Prisma.MusicGetPayload<{ select: typeof musicTrackSelect }>;

export function toMusicTrackDto(track: MusicTrackRecord): MusicTrackDto {
  return {
    ...track,
    createdAt: track.createdAt.toISOString(),
  };
}
