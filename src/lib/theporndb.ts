/**
 * ThePornDB (stash-box) GraphQL API for performer metadata and images.
 * Docs: https://theporndb.net/ — token at https://theporndb.net/user/api-tokens
 * Auth: Authorization: Bearer <token>
 */

const TPDB_ENDPOINT = process.env.TPDB_API_URL || "https://theporndb.net/graphql";

export type TpdbImage = {
  id: string;
  url: string;
  width?: number | null;
  height?: number | null;
};

export type TpdbUrl = {
  url: string;
  type: string;
};

export type TpdbMeasurements = {
  band_size?: number | null;
  cup_size?: string | null;
  waist?: number | null;
  hip?: number | null;
};

export type TpdbBodyModification = {
  location: string;
  description?: string | null;
};

export type TpdbPerformer = {
  id: string;
  name: string;
  disambiguation?: string | null;
  aliases?: string[];
  gender?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  ethnicity?: string | null;
  country?: string | null;
  eye_color?: string | null;
  hair_color?: string | null;
  height?: number | null;
  measurements?: TpdbMeasurements | null;
  breast_type?: string | null;
  career_start_year?: number | null;
  career_end_year?: number | null;
  tattoos?: TpdbBodyModification[];
  piercings?: TpdbBodyModification[];
  urls?: TpdbUrl[];
  images: TpdbImage[];
};

const PERFORMER_FIELDS = `
  id
  name
  disambiguation
  aliases
  gender
  birth_date
  death_date
  ethnicity
  country
  eye_color
  hair_color
  height
  measurements {
    band_size
    cup_size
    waist
    hip
  }
  breast_type
  career_start_year
  career_end_year
  tattoos {
    location
    description
  }
  piercings {
    location
    description
  }
  urls {
    url
    type
  }
  images {
    id
    url
    width
    height
  }
`;

const SEARCH_PERFORMER_QUERY = `
  query SearchPerformer($term: String!) {
    searchPerformer(term: $term) {
      ${PERFORMER_FIELDS}
    }
  }
`;

const FIND_PERFORMER_QUERY = `
  query FindPerformer($id: ID!) {
    findPerformer(id: $id) {
      ${PERFORMER_FIELDS}
    }
  }
`;

function getApiKey(): string | null {
  const key = process.env.TPDB_API_KEY?.trim();
  return key || null;
}

export function isTpdbConfigured(): boolean {
  return Boolean(getApiKey());
}

async function tpdbGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("ThePornDB API key not configured (set TPDB_API_KEY)");
  }

  const res = await fetch(TPDB_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "pisster/1.0",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`ThePornDB request failed (${res.status})`);
  }

  const json = (await res.json()) as {
    data?: T;
    errors?: { message: string }[];
  };

  if (json.errors?.length) {
    throw new Error(json.errors[0].message || "ThePornDB GraphQL error");
  }

  if (!json.data) {
    throw new Error("ThePornDB returned no data");
  }

  return json.data;
}

/** Search performers by name; returns up to API limit (typically ~25). */
export async function searchTpdbPerformers(term: string): Promise<TpdbPerformer[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];

  const data = await tpdbGraphql<{ searchPerformer: TpdbPerformer[] }>(SEARCH_PERFORMER_QUERY, {
    term: trimmed,
  });

  return data.searchPerformer ?? [];
}

/** Fetch a single performer by ThePornDB id. */
export async function findTpdbPerformer(id: string): Promise<TpdbPerformer | null> {
  const data = await tpdbGraphql<{ findPerformer: TpdbPerformer | null }>(FIND_PERFORMER_QUERY, {
    id,
  });
  return data.findPerformer ?? null;
}

/** Pick the best portrait image (prefer taller aspect ratio). */
export function pickBestTpdbImage(images: TpdbImage[]): TpdbImage | null {
  if (!images.length) return null;
  return [...images].sort((a, b) => {
    const arA = a.width && a.height ? a.height / a.width : 1.5;
    const arB = b.width && b.height ? b.height / b.width : 1.5;
    const scoreA = Math.abs(arA - 1.5) + (a.height ?? 0) / 10000;
    const scoreB = Math.abs(arB - 1.5) + (b.height ?? 0) / 10000;
    return scoreA - scoreB;
  })[0];
}

/** Download image bytes from a TPDB CDN URL. */
export async function downloadTpdbImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "pisster/1.0" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to download image (${res.status})`);
  }
  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error("URL did not return an image");
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 500) {
    throw new Error("Downloaded image is too small");
  }
  if (buffer.length > 8 * 1024 * 1024) {
    throw new Error("Image exceeds 8MB limit");
  }
  return { buffer, contentType };
}
