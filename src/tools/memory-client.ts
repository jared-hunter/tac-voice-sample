import {
  TAC,
  MemoryPromptBuilder,
  type TACMemoryResponse,
  type ConversationSession,
  type ConversationId,
} from 'twilio-agent-connect';

/**
 * Twilio Conversation Memory API Client
 * Direct API access for profile traits, observations, and recall
 */

interface ProfileTraits {
  [groupName: string]: {
    [fieldName: string]: unknown;
  };
}

interface Profile {
  id: string;
  serviceSid: string;
  traits: ProfileTraits;
  dateCreated: string;
  dateUpdated: string;
  url: string;
}

interface ProfileLookupResponse {
  profiles: Profile[];
}

const MEMORY_API_BASE = "https://memory.twilio.com/v1";


/**
 * Extract customer profile ID from TAC memory response
 * Profile ID is nested in communications[].author.profileId where author.type === "CUSTOMER"
 */
export const extractCustomerProfileId = (memory: TACMemoryResponse | undefined): string | undefined => {
  if (!memory) return undefined;

  const memoryData = (memory as any)?._data || memory;
  const communications = memoryData?.communications || [];

  // Find first communication where author is CUSTOMER and has profileId
  for (const comm of communications) {
    if (comm.author?.type === 'CUSTOMER' && comm.author?.profileId) {
      return comm.author.profileId;
    }
  }
  
  return undefined;
}

/**
 * Get profile by profile ID
 */
export async function getProfile(
  memorySid: string,
  profileId: string,
): Promise<Profile | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.error("[MEMORY] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
    return null;
  }

  try {
    const url = `${MEMORY_API_BASE}/Stores/${memorySid}/Profiles/${profileId}`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    console.log(
      `[MEMORY] Fetching profile ${profileId} from memory store ${memorySid}...`,
    );
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error(
        `[MEMORY] Failed to fetch profile: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const profile = (await response.json()) as Profile;
    console.log("PROFILE: ", profile);
    return profile;
  } catch (error) {
    console.error("[MEMORY] Error fetching profile:", error);
    return null;
  }
}

/**
 * Look up profile by phone number, email, or other identifier
 */
export async function lookupProfile(
  memorySid: string,
  idType: "phone" | "email",
  value: string,
): Promise<Profile | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.error("[MEMORY] Missing credentials");
    return null;
  }

  try {
    const url = `${MEMORY_API_BASE}/Services/${memorySid}/Profiles/Lookup`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idType, value }),
    });

    if (!response.ok) {
      console.error(`[MEMORY] Profile lookup failed: ${response.status}`);
      return null;
    }

    const result = (await response.json()) as ProfileLookupResponse;
    return result.profiles[0] ?? null;
  } catch (error) {
    console.error("[MEMORY] Error looking up profile:", error);
    return null;
  }
}

/**
 * Format traits for prompt injection
 */
export function formatTraitsForPrompt(traits: ProfileTraits): string {
  const lines: string[] = [];

  for (const [groupName, fields] of Object.entries(traits)) {
    lines.push(`${groupName}:`);
    for (const [fieldName, value] of Object.entries(fields)) {
      lines.push(
        `  ${fieldName}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
      );
    }
  }

  return lines.join("\n");
}

/**
 * Get Profile Traits for prompt injection
 */
export async function getProfileTraitsForPrompt(profileId: string | undefined, memorySid: string | undefined): Promise<string | undefined> {

  if (profileId && memorySid) {
    console.log(`[MEMORY] Fetching traits for profile: ${profileId}`);

    const profile = await getProfile(memorySid, profileId);

    if (profile?.traits && Object.keys(profile.traits).length > 0) {
      const traitsContext = `\n\nCustomer Profile:\n${formatTraitsForPrompt(profile.traits)}`;
      console.log(`[MEMORY] Loaded ${Object.keys(profile.traits).length} trait group(s) for profile ${profileId}`);
      return traitsContext;
    } else {
      console.log('[MEMORY] No traits found for profile');
    }
  } else if (!profileId) {
    console.log('[MEMORY] No customer profile ID found in memory response');
  } else if (!memorySid) {
    console.log('[MEMORY] TWILIO_MEMORY_STORE_ID not configured');
  }

  return
}

/**
 * Update profile traits
 */
export async function updateProfileTraits(
  memorySid: string,
  profileId: string,
  traits: ProfileTraits,
): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.error("[MEMORY] Missing credentials");
    return false;
  }

  try {
    const url = `${MEMORY_API_BASE}/Stores/${memorySid}/Profiles/${profileId}`;
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    console.log(
      `[MEMORY] Updating traits for profile ${profileId} in memory store ${memorySid}...`,
    );
    console.log("New traits:", JSON.stringify({ traits }));

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ traits }),
    });

    // API returns 202 Accepted for async processing
    if (response.status !== 202 && !response.ok) {
      const errorBody = await response.text();
      console.error(
        `[MEMORY] Failed to update traits: ${response.status} ${response.statusText}`,
      );
      console.error(`[MEMORY] Error details: ${errorBody}`);
      return false;
    }

    const result = await response.json();
    console.log(
      `[MEMORY] Successfully submitted trait update for profile ${profileId}`,
    );
    console.log(`[MEMORY] Response:`, result);
    return true;
  } catch (error) {
    console.error("[MEMORY] Error updating traits:", error);
    return false;
  }
}
