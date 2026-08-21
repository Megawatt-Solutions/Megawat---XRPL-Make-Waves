"use client";
// Stream Vault demo — EVM area (Base Sepolia), self-contained: its own wallet
// provider (MetaMask) on top of the app-wide toast context.
import { StreamProvider } from "@/lib/stream/StreamProvider";
import { StreamApp } from "@/components/stream/StreamApp";

export default function StreamPage() {
  return (
    <StreamProvider>
      <StreamApp />
    </StreamProvider>
  );
}
