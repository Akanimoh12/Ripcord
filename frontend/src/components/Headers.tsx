"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { chain } from "@/lib/config";
import { shortAddr } from "@/lib/format";
import { Mark } from "./Art";

export function Wordmark({ href = "/", size = 22 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="wordmark display" style={{ fontSize: size }}>
      <Mark size={size + 16} />
      RIPCORD
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap row-between">
        <Wordmark href="#top" size={28} />
        <nav aria-label="Main" className="nav">
          <a href="#story" className="nav-link">The story</a>
          <a href="#how" className="nav-link">How it works</a>
          <a href="#questions" className="nav-link">Questions</a>
          <Link href="/dive" className="btn btn-sm">SET YOUR ROPE</Link>
        </nav>
      </div>
    </header>
  );
}

const APP_LINKS = [
  { href: "/boat", label: "The boat" },
  { href: "/dive", label: "Dive" },
  { href: "/line", label: "Your line" },
];

export function AppHeader() {
  const path = usePathname();
  const current = path === "/surfaced" ? "/line" : path;
  return (
    <header className="app-header">
      <div className="app-wrap row-between">
        <Wordmark />
        <nav aria-label="App" className="nav">
          {APP_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={current === l.href ? "page" : undefined}
              className={`tab ${current === l.href ? "tab-on" : ""}`}
            >
              {l.label}
            </Link>
          ))}
          <WalletButton />
        </nav>
      </div>
    </header>
  );
}

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <button
        type="button"
        className="btn-wallet"
        disabled={!injected || isPending}
        onClick={() => injected && connect({ connector: injected })}
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  if (chainId !== chain.id) {
    return (
      <button type="button" className="btn-wallet btn-warn" onClick={() => switchChain({ chainId: chain.id })}>
        Switch to {chain.name}
      </button>
    );
  }

  return (
    <button type="button" className="wallet-chip" onClick={() => disconnect()} title="Disconnect">
      {shortAddr(address)}
    </button>
  );
}
