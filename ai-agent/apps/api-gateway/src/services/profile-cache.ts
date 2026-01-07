import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import type { ProfilePreference } from '@apps/ai-agent-core/src/impi/recommend.js';

const TTL_MS = Number(process.env.PROFILE_CACHE_TTL_MS || 5 * 60 * 1000);
const cache = new Map<string, { value: ProfilePreference; expiresAt: number }>();
let seedProfiles: Record<string, ProfilePreference> | null = null;

export async function getProfilePreference(userId: string | undefined | null): Promise<ProfilePreference | null> {
  if (!userId) {
    return null;
  }
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const fetched = (await fetchRemoteProfile(userId)) || (await loadSeedProfile(userId));
  const value = fetched || null;
  if (value) {
    cache.set(userId, { value, expiresAt: Date.now() + TTL_MS });
  }
  return value;
}

async function fetchRemoteProfile(userId: string): Promise<ProfilePreference | null> {
  const endpoint = process.env.IMPACTSHOP_PROFILE_ENDPOINT;
  if (!endpoint) {
    return null;
  }
  try {
    const url = `${endpoint}?user=${encodeURIComponent(userId)}`;
    const response = await fetch(url, {
      headers: buildProfileHeaders(),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as Record<string, unknown>;
    return normalizeProfilePayload(payload);
  } catch (error) {
    console.warn('profile-cache: remote fetch failed', error);
    return null;
  }
}

function buildProfileHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.IMPACTSHOP_PROFILE_API_KEY) {
    headers['X-API-Key'] = process.env.IMPACTSHOP_PROFILE_API_KEY;
  }
  return headers;
}

async function loadSeedProfile(userId: string): Promise<ProfilePreference | null> {
  if (!seedProfiles) {
    seedProfiles = await readSeedFile();
  }
  if (!seedProfiles) {
    return null;
  }
  return seedProfiles[userId] ?? null;
}

async function readSeedFile(): Promise<Record<string, ProfilePreference> | null> {
  const seedPath = process.env.PROFILE_CACHE_SEED_PATH
    ? path.resolve(process.cwd(), process.env.PROFILE_CACHE_SEED_PATH)
    : path.resolve(process.cwd(), 'data', 'profile-cache.json');
  try {
    const contents = await fs.readFile(seedPath, 'utf8');
    const parsed = JSON.parse(contents) as Record<string, ProfilePreference>;
    return parsed;
  } catch (error) {
    return null;
  }
}

function normalizeProfilePayload(payload: Record<string, unknown>): ProfilePreference {
  return {
    preferredNgo: typeof payload['preferredNgo'] === 'string' ? payload['preferredNgo'] : undefined,
    preferredCategory: typeof payload['preferredCategory'] === 'string' ? payload['preferredCategory'] : undefined,
    lastDonationAt: typeof payload['lastDonationAt'] === 'string' ? payload['lastDonationAt'] : undefined,
  };
}
