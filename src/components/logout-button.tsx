"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function LogoutButton() {
	const router = useRouter();
	const [pending, setPending] = useState(false);

	async function onLogout() {
		setPending(true);
		try {
			await fetch("/api/auth/logout", { method: "POST" });
			router.push("/login");
		} finally {
			setPending(false);
		}
	}

	return (
		<Button type="button" variant="outline" onClick={onLogout} disabled={pending}>
			Logout
		</Button>
	);
}
