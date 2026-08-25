import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { BusyProvider } from "@/components/Loading";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const APP_NAME = "Foto Keluarga";
const APP_DESCRIPTION = "Kenangan foto dan video keluarga, mudah dilihat dan diunduh.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body
        className={`${sans.variable} min-h-dvh bg-black font-sans text-ink antialiased`}
      >
        <BusyProvider>{children}</BusyProvider>
      </body>
    </html>
  );
}
