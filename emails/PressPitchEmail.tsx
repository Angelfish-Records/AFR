import * as React from 'react'
import {Html, Head, Preview, Body, Container, Section, Text, Link, Hr, Img} from '@react-email/components'
import {Markdown} from '@react-email/markdown'

export type PressPitchEmailProps = {
  previewText?: string
  brandName?: string
  logoUrl?: string
  heroUrl?: string
  subject?: string

  recipientName?: string
  campaignName?: string

  // This is your merged long-form body, authored as Markdown
  bodyMarkdown: string

  // Optional footer bits (you already have these fields)
  defaultCta?: string
  keyLinks?: string
  assetsPackLink?: string
}

export default function PressPitchEmail(props: PressPitchEmailProps) {
  const {
    previewText,
    brandName = 'Angelfish Records',
    logoUrl,
    heroUrl,
    recipientName,
    campaignName,
    bodyMarkdown,
    defaultCta,
    keyLinks,
    assetsPackLink,
  } = props

  const preview = previewText ?? `${brandName}${campaignName ? ` — ${campaignName}` : ''}`

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{margin: 0, padding: 0, backgroundColor: '#f6f6f6'}}>
        <Container style={{maxWidth: 640, margin: '0 auto', padding: '24px 12px'}}>
          <Section style={{backgroundColor: '#ffffff', borderRadius: 16, overflow: 'hidden', border: '1px solid #eee'}}>
            {(logoUrl || heroUrl) && (
              <Section style={{padding: 18}}>
                {logoUrl ? <Img src={logoUrl} alt={brandName} height="28" /> : null}
              </Section>
            )}

            {heroUrl ? <Img src={heroUrl} alt="" width="640" style={{width: '100%'}} /> : null}

            <Section style={{padding: '18px 18px 6px'}}>
              {recipientName ? (
                <Text style={{margin: 0, fontSize: 14, color: '#111'}}>Kia ora {recipientName},</Text>
              ) : null}

              <div style={{fontSize: 14, color: '#111', lineHeight: '1.55'}}>
                <Markdown>{bodyMarkdown}</Markdown>
              </div>

              <Hr style={{border: 0, borderTop: '1px solid #eee', margin: '18px 0'}} />

              {(defaultCta || keyLinks || assetsPackLink) && (
                <Section style={{paddingBottom: 10}}>
                  {defaultCta ? <Text style={{margin: '0 0 8px', fontSize: 13, color: '#111'}}>{defaultCta}</Text> : null}

                  {keyLinks ? (
                    <Text style={{margin: '0 0 6px', fontSize: 13, color: '#111'}}>
                      <b>Key links:</b> {keyLinks}
                    </Text>
                  ) : null}

                  {assetsPackLink ? (
                    <Text style={{margin: 0, fontSize: 13, color: '#111'}}>
                      <b>Assets pack:</b> <Link href={assetsPackLink}>{assetsPackLink}</Link>
                    </Text>
                  ) : null}
                </Section>
              )}

              <Text style={{margin: '18px 0 0', fontSize: 13, color: '#444'}}>
                — Brendan<br />
                {brandName}
              </Text>

              <Text style={{margin: '10px 0 16px', fontSize: 11, color: '#888'}}>
                If you’d prefer not to receive pitches, reply with “unsubscribe” and I’ll remove you.
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
