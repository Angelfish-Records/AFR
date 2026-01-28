// emails/PressPitchEmail.tsx
import * as React from 'react'
import {Html, Head, Preview, Body, Container, Section, Img, Text} from '@react-email/components'
import {Markdown} from '@react-email/markdown'

export type PressPitchEmailProps = {
  previewText?: string
  brandName?: string
  logoUrl?: string
  heroUrl?: string

  // EVERYTHING textual comes from the inline editor (merged markdown).
  bodyMarkdown: string
}

const styles = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: '#0b0b0b',
  },
  outer: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '28px 14px',
  },
  card: {
    backgroundColor: '#DDC18F',
    borderRadius: 18,
    overflow: 'hidden' as const,
    border: '1px solid rgba(255,255,255,0.10)',
  },
  header: {
    padding: 18,
    paddingBottom: 12,
  },
  logo: {
    display: 'block',
    height: 28,
    width: 'auto',
  } as const,
  hero: {
    width: '100%',
    display: 'block',
  } as const,
  content: {
    padding: '18px 18px 22px',
  },
  proseWrap: {
    fontSize: 16,
    lineHeight: '1.65',
    color: '#14110b',
    fontFamily: '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",Times,serif',
    letterSpacing: '0.1px',
  } as const,
  finePrint: {
    margin: '18px 0 0',
    fontSize: 12,
    lineHeight: '1.5',
    color: 'rgba(20,17,11,0.70)',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
  } as const,
}

type MarkdownCustomStyles = React.ComponentProps<typeof Markdown>['markdownCustomStyles']

const mdStyles: Record<string, React.CSSProperties> = {
  p: {margin: '0 0 14px'},
  a: {color: '#0b0b0b', textDecoration: 'underline', textUnderlineOffset: '3px'},
  hr: {border: 0, borderTop: '1px solid rgba(20,17,11,0.18)', margin: '18px 0'},
  h1: {fontSize: '22px', lineHeight: '1.25', margin: '0 0 14px'},
  h2: {fontSize: '18px', lineHeight: '1.3', margin: '16px 0 10px'},
  li: {margin: '0 0 6px'},
}

export default function PressPitchEmail(props: PressPitchEmailProps) {
  const {previewText, brandName = 'Angelfish Records', logoUrl, heroUrl, bodyMarkdown} = props
  const preview = previewText ?? brandName

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>

      <Body style={styles.body}>
        <Container style={styles.outer}>
          <Section style={styles.card}>
            {logoUrl ? (
              <Section style={styles.header}>
                <Img src={logoUrl} alt={brandName} style={styles.logo} />
              </Section>
            ) : null}

            {heroUrl ? <Img src={heroUrl} alt="" width={720} style={styles.hero} /> : null}

            <Section style={styles.content}>
              <div style={styles.proseWrap}>
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
              </div>

              {/* remove if you want absolute purity */}
              <Text style={styles.finePrint}>{brandName}</Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
