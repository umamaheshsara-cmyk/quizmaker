import "server-only";

export const PBKDF2_ITERATIONS = 100_000;
const HASH_BITS = 256;
const SALT_BYTES = 16;

export async function hashPassword(
	passwordSha256: string,
): Promise<{ salt: string; hash: string }> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const hash = await deriveHash(passwordSha256, salt);
	return { salt: toHex(salt), hash: toHex(hash) };
}

export async function verifyPassword(
	passwordSha256: string,
	saltHex: string,
	hashHex: string,
): Promise<boolean> {
	try {
		const salt = fromHex(saltHex);
		const expected = fromHex(hashHex);
		const actual = await deriveHash(passwordSha256, salt);
		return timingSafeEqual(actual, expected);
	} catch {
		return false;
	}
}

async function deriveHash(
	passwordSha256: string,
	salt: Uint8Array,
): Promise<Uint8Array> {
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(passwordSha256),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		keyMaterial,
		HASH_BITS,
	);
	return new Uint8Array(bits);
}

function toHex(bytes: Uint8Array): string {
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
	if (hex.length % 2 !== 0) {
		throw new Error("Invalid hex");
	}
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i += 1) {
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < left.length; i += 1) {
		diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
	}
	return diff === 0;
}
