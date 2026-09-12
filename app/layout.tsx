import type { Metadata, Viewport } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import "./globals.css";

const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
const metadataBase = new URL(configuredUrl && /^https?:\/\//.test(configuredUrl) ? configuredUrl : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase,
  title: { default: "Aperture Hours — read the daylight window", template: "%s — Aperture Hours" },
  description: "Compare every returned two-hour daylight window for a city, date, and activity using visible Open-Meteo forecast evidence.",
  applicationName: "Aperture Hours",
  icons: { icon: "/icon.svg" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
