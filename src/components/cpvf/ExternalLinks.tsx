import { TOKENS } from '../../pages/_TerminalShell';

interface ExternalLinksProps {
  slug: string;
  geckoId: string | null;
}

interface LinkSpec {
  label: string;
  href: string;
}

export function ExternalLinks({ slug, geckoId }: ExternalLinksProps) {
  const links: LinkSpec[] = [
    { label: 'View on DefiLlama ↗', href: `https://defillama.com/protocol/${slug}` },
  ];
  if (geckoId) {
    links.push({
      label: 'View on CoinGecko ↗',
      href: `https://www.coingecko.com/en/coins/${geckoId}`,
    });
  }
  links.push({
    label: 'Unlock schedule (Tokenomist) ↗',
    href: `https://tokenomist.ai/${slug}`,
  });

  return (
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          color: TOKENS.amber,
          fontSize: 9,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        External
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
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
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}
