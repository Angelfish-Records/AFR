// emails/PressPitchEmail.tsx
import * as React from 'react'
import {Html, Head, Preview, Body, Container, Section, Img, Text} from '@react-email/components'
import {Markdown} from '@react-email/markdown'

export type PressPitchEmailProps = {
  previewText?: string
  brandName?: string
  logoUrl?: string
  heroUrl?: string
  bodyMarkdown: string
}

const BOX_BG = '#DDC18F'
const PAGE_BG = '#0b0b0b'
const TEXT = '#14110b'
const MUTED = 'rgba(20,17,11,0.72)'

const styles = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: PAGE_BG,
  },
  outer: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '36px 18px', // more breathing room
  },
  // Centered logo area ABOVE the box
  topLogoWrap: {
    textAlign: 'center' as const,
    paddingBottom: 18,
  },
  logoImg: {
    display: 'inline-block',
    height: 34,
    width: 'auto',
  } as const,
  logoPlaceholder: {
    display: 'inline-block',
    width: 140,
    height: 34,
    lineHeight: '34px',
    borderRadius: 10,
    border: `1px dashed rgba(221,193,143,0.75)`,
    color: `rgba(221,193,143,0.95)`,
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
    fontSize: 12,
    letterSpacing: '0.2px',
  } as const,

  card: {
    backgroundColor: BOX_BG,
    borderRadius: 22,
    overflow: 'hidden' as const,
    border: '1px solid rgba(255,255,255,0.10)',
  },
  hero: {
    width: '100%',
    display: 'block',
  } as const,
  content: {
    padding: '22px 22px 24px', // more padding
  },

  proseWrap: {
    fontSize: 14, // more “polished corporate” than 16
    lineHeight: '1.65',
    color: TEXT,
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
    letterSpacing: '0px',
  } as const,

  // Footer OUTSIDE the box, in the same tone as the box
  footerOutside: {
    textAlign: 'center' as const,
    marginTop: 16,
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
    fontSize: 12,
    lineHeight: '1.4',
    color: `rgba(221,193,143,0.95)`,
  } as const,
  footerOutsideMuted: {
    marginTop: 6,
    fontSize: 11,
    color: `rgba(221,193,143,0.70)`,
  } as const,
}

type MarkdownCustomStyles = React.ComponentProps<typeof Markdown>['markdownCustomStyles']

const mdStyles: Record<string, React.CSSProperties> = {
  p: {margin: '0 0 12px'},
  a: {color: TEXT, textDecoration: 'underline', textUnderlineOffset: '3px'},
  hr: {border: 0, borderTop: '1px solid rgba(20,17,11,0.16)', margin: '16px 0'},
  h1: {fontSize: '18px', lineHeight: '1.25', margin: '0 0 12px'},
  h2: {fontSize: '15px', lineHeight: '1.3', margin: '14px 0 8px', color: TEXT},
  li: {margin: '0 0 6px'},
  strong: {color: TEXT},
  em: {color: MUTED},
}

export default function PressPitchEmail(props: PressPitchEmailProps) {
  const {previewText, brandName = 'Angelfish Records', logoUrl, heroUrl, bodyMarkdown} = props
  const preview = previewText ?? brandName

  return (
    <Html>
      <Head>
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
  <style>{`
    :root { color-scheme: light; supported-color-schemes: light; }
    body { -webkit-text-size-adjust: 100%; }

    /* Stop “smart invert” / dark-mode image filtering where supported */
    img { filter: none !important; -webkit-filter: none !important; }

    /* If a client forces dark mode anyway, force your intended colours back */
    @media (prefers-color-scheme: dark) {
      body, .bg-page { background: ${PAGE_BG} !important; }
      .card { background: ${BOX_BG} !important; }
      .prose, .prose * { color: ${TEXT} !important; }
    }
  `}</style>
</Head>

      <Preview>{preview}</Preview>

      <Body style={styles.body} className="bg-page">
        <Container style={styles.outer}>
          {/* Logo placeholder / logo URL (centered, above the card) */}
        <Section style={styles.topLogoWrap}>
        {logoUrl ? (
            <Img src={logoUrl} alt={brandName} style={styles.logoImg} />
        ) : (
            <Text style={styles.logoPlaceholder}>LOGO</Text>
        )}
        </Section>

          {/* Main content box */}
          <Section style={styles.card} className="card">
            {heroUrl ? <Img src={heroUrl} alt="" width={720} style={styles.hero} /> : null}

            <Section style={styles.content}>
                <Section style={styles.proseWrap} className="prose">
                    <Markdown
                    markdownContainerStyles={{
                        fontFamily: styles.proseWrap.fontFamily,
                        fontSize: styles.proseWrap.fontSize,
                        lineHeight: styles.proseWrap.lineHeight,
                        color: styles.proseWrap.color,
                    }}
                    markdownCustomStyles={mdStyles as unknown as MarkdownCustomStyles}
                    >
                    {bodyMarkdown}
                    </Markdown>
                </Section>
                </Section>
          </Section>

          {/* Footer OUTSIDE the card, in the box's tone */}
          <Text style={styles.footerOutside}>{brandName}</Text>
        </Container>
      </Body>
    </Html>
  )
}
