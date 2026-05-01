import { useEffect, useState } from 'react';
import { TOKENS } from '../../pages/_TerminalShell';

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
    ? `https://twitter.com/${dl.twitter.replace(/^@/, '')}`
    : cg?.twitter_screen_name
      ? `https://twitter.com/${cg.twitter_screen_name}`
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

  const items: Array<{ label: string; href: string }> = [];
  if (links.twitter) items.push({ label: 'Twitter ↗', href: links.twitter });
  if (links.website) items.push({ label: 'Website ↗', href: links.website });
  if (links.discord) items.push({ label: 'Discord ↗', href: links.discord });
  if (links.telegram) items.push({ label: 'Telegram ↗', href: links.telegram });
  if (links.github) items.push({ label: 'GitHub ↗', href: links.github });

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
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="cpvf-extlink"
            style={{
              display: 'block',
              padding: '10px 14px',
              border: `1px solid ${TOKENS.border}`,
              background: 'transparent',
              color: TOKENS.text,
              fontSize: 11,
              letterSpacing: '0.06em',
            }}
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  );
}
