import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Onboarder",
  description: "AI-powered onboarding generator for Next.js apps",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
