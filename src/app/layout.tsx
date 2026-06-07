import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const outfit = Outfit({
	subsets: ["latin"],
	variable: "--font-sans",
	display: "swap",
});

const BASE_URL = "https://dubster.ankur.codes";
const TITLE = "Dubster — AI Video Dubbing in Your Browser";
const DESCRIPTION =
	"Paste any YouTube URL and hear it dubbed in real-time by an AI voice — entirely in your browser. No account needed. Free forever.";

export const metadata: Metadata = {
	metadataBase: new URL(BASE_URL),
	title: {
		default: TITLE,
		template: "%s | Dubster",
	},
	description: DESCRIPTION,
	keywords: [
		"AI dubbing",
		"YouTube dubbing",
		"text to speech",
		"Kokoro TTS",
		"browser TTS",
		"video dubbing",
		"AI voice",
		"free dubbing",
	],
	authors: [{ name: "Dubster" }],
	creator: "Dubster",
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-video-preview": -1,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
	openGraph: {
		type: "website",
		locale: "en_US",
		url: BASE_URL,
		siteName: "Dubster",
		title: TITLE,
		description: DESCRIPTION,
		images: [
			{
				url: "/og-image.png",
				width: 1200,
				height: 630,
				alt: "Dubster — AI Video Dubbing in Your Browser",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: TITLE,
		description: DESCRIPTION,
		images: ["/og-image.png"],
		creator: "@dubsterapp",
	},
	icons: {
		icon: "/favicon.svg",
		shortcut: "/favicon.svg",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={cn("dark font-sans", outfit.variable)}>
			<head />
			<body className="antialiased">{children}</body>
		</html>
	);
}
