import { useEffect, useState, type ReactNode } from 'react';
import { TOKENS } from '../../pages/_TerminalShell';

// ─── inline icon components ─────────────────────────────────────────────
// All icons single-color via currentColor so they pick up text color and
// inherit the amber hover via the cpvf-extlink rule. No icon library
// dependency — kept inline to avoid adding lucide-react etc.

interface IconProps { size?: number; }

function XIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

function GlobeIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function DiscordIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <path d="M7.5 7.5c3.5 -1 5.5 -1 9 0" />
      <path d="M7 16.5c3.5 1 6.5 1 10 0" />
      <path d="M15.5 17c0 1 1.5 3 2 3 1.5 0 2.833 -1.667 3.5 -3 .667 -1.667 .5 -5.833 -1.5 -11.5 -1.457 -1.015 -3 -1.34 -4.5 -1.5l-1 2.5" />
      <path d="M8.5 17c0 1 -1.356 3 -1.832 3 -1.429 0 -2.698 -1.667 -3.333 -3 -.635 -1.667 -.476 -5.833 1.428 -11.5 1.388 -1.015 2.782 -1.34 4.237 -1.5l1 2.5" />
    </svg>
  );
}

function TelegramIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 10l-4 4l6 6l4 -16l-18 7l4 2l2 6l3 -4" />
    </svg>
  );
}

function GithubIcon({ size = 14 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

// ─── data layer ─────────────────────────────────────────────────────────

interface SocialLinksProps {
  protocolSlug: string;
  coingeckoId: string | null;
}

interface DefiLlamaProtocolDetail {
  twitter?: string;
  url?: string;
  github?: string[];
}

interface CoinGeckoLinks {
  homepage?: string[];
  twitter_screen_name?: string;
  chat_url?: string[];
  repos_url?: { github?: string[] };
}

interface CoinGeckoCoin {
  links?: CoinGeckoLinks;
}

interface MergedLinks {
  twitter: string | null;
  website: string | null;
  discord: string | null;
  telegram: string | null;
  github: string | null;
}

// DefiLlama is primary, CoinGecko fills what DefiLlama doesn't track. Discord
// and Telegram come ONLY from CoinGecko (DefiLlama doesn't expose them).
function mergeLinks(
  dl: DefiLlamaProtocolDetail | null,
  cg: CoinGeckoLinks | null,
): MergedLinks {
  const twitter: string | null = dl?.twitter
    ? `https://x.com/${dl.twitter.replace(/^@/, '')}`
    : cg?.twitter_screen_name
      ? `https://x.com/${cg.twitter_screen_name}`
      : null;

  const website: string | null = dl?.url || cg?.homepage?.[0] || null;

  const discord: string | null =
    cg?.chat_url?.find((u) => /discord\.(gg|com)/i.test(u)) || null;
  const telegram: string | null =
    cg?.chat_url?.find((u) => /(t\.me|telegram\.me)/i.test(u)) || null;

  const github: string | null = dl?.github?.[0]
    ? `https://github.com/${dl.github[0]}`
    : cg?.repos_url?.github?.[0] || null;

  return { twitter, website, discord, telegram, github };
}

interface SocialItem {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
}

export function SocialLinks({ protocolSlug, coingeckoId }: SocialLinksProps) {
  const [links, setLinks] = useState<MergedLinks | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLinks(null);

    const dlPromise: Promise<DefiLlamaProtocolDetail | null> = fetch(
      `https://api.llama.fi/protocol/${encodeURIComponent(protocolSlug)}`,
    )
      .then((r) => (r.ok ? (r.json() as Promise<DefiLlamaProtocolDetail>) : null))
      .catch(() => null);

    const cgPromise: Promise<CoinGeckoCoin | null> = coingeckoId
      ? fetch(
          `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coingeckoId)}` +
            `?localization=false&tickers=false&market_data=false` +
            `&community_data=false&developer_data=false&sparkline=false`,
        )
          .then((r) => (r.ok ? (r.json() as Promise<CoinGeckoCoin>) : null))
          .catch(() => null)
      : Promise.resolve(null);

    Promise.all([dlPromise, cgPromise]).then(([dl, cg]) => {
      if (cancelled) return;
      setLinks(mergeLinks(dl, cg?.links || null));
    });

    return () => {
      cancelled = true;
    };
  }, [protocolSlug, coingeckoId]);

  if (!links) return null;

  const items: SocialItem[] = [];
  if (links.twitter)
    items.push({ key: 'x', label: 'X', href: links.twitter, icon: <XIcon /> });
  if (links.website)
    items.push({ key: 'website', label: 'Website', href: links.website, icon: <GlobeIcon /> });
  if (links.discord)
    items.push({ key: 'discord', label: 'Discord', href: links.discord, icon: <DiscordIcon /> });
  if (links.telegram)
    items.push({ key: 'telegram', label: 'Telegram', href: links.telegram, icon: <TelegramIcon /> });
  if (links.github)
    items.push({ key: 'github', label: 'GitHub', href: links.github, icon: <GithubIcon /> });

  if (items.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          color: TOKENS.amber,
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          marginBottom: 12,
        }}
      >
        Social
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <a
            key={item.key}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="cpvf-extlink"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              border: `1px solid ${TOKENS.border}`,
              background: 'transparent',
              color: TOKENS.text,
              fontSize: 11,
              letterSpacing: '0.06em',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              {item.icon}
              <span>{item.label}</span>
            </span>
            <span>↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}
