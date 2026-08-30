import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { getPageMeta } from '@/data/content';

const page = getPageMeta('/terms-of-service');
export const metadata: Metadata = { title: page?.title ?? 'Terms of Service', description: page?.description };
const sections = [
  { title: '1. Definitions', paragraphs: ['“Kinetic Router,” “we,” and “us” mean Kinetic Router. “Services” means the Kinetic Router website, API gateway, console, documentation, and related offerings. “Content” includes prompts, files, inputs, and AI-generated outputs.'] },
  { title: '2. Scope of Terms', paragraphs: ['These Terms govern access to and use of the Services. By creating an account, purchasing credits, or using an API key, you agree to these Terms and applicable policies.'] },
  { title: '3. Account Registration and Use', paragraphs: ['Provide accurate information, keep credentials secure, and promptly report unauthorized access. You are responsible for activity conducted through your account and API keys.'] },
  { title: '4. Service Rules', paragraphs: ['Use the Services only in compliance with applicable law, upstream provider requirements, rate limits, documentation, and reasonable technical restrictions.'] },
  { title: '5. Prohibited Conduct', paragraphs: ['You may not abuse, disrupt, reverse engineer, resell without authorization, evade safeguards, or use the Services for unlawful, harmful, deceptive, or infringing activity.'] },
  { title: '6. Payments, Credits, and Refunds', paragraphs: ['Usage is charged against account credits at the rates displayed for the selected model and request components. Prices may change. Except where required by law, purchased and promotional credits are non-refundable and have no cash value.'] },
  { title: '7. User Content and AI Outputs', paragraphs: ['You retain rights you have in submitted Content. You authorize the processing needed to route requests and return outputs. AI outputs may be inaccurate, incomplete, or similar to outputs produced for others; review them before use.'] },
  { title: '8. Intellectual Property', paragraphs: ['The Services, website, branding, software, and documentation are owned by Kinetic Router or its licensors. These Terms provide a limited right to use the Services and do not transfer ownership.'] },
  { title: '9. Privacy and Data Processing', paragraphs: ['Our Privacy Policy explains how information is handled. Requests may be processed by the upstream provider associated with the selected model.'] },
  { title: '10. Service Changes, Suspension, and Termination', paragraphs: ['We may change models, routes, limits, features, or pricing and may suspend access for security, legal, payment, abuse, or operational reasons. You may stop using the Services at any time.'] },
  { title: '11. Disclaimers and Limitation of Liability', paragraphs: ['The Services are provided “as is” and “as available.” To the maximum extent permitted by law, Kinetic Router disclaims implied warranties and is not liable for indirect, incidental, special, consequential, or lost-profit damages.'] },
  { title: '12. Indemnity', paragraphs: ['You agree to defend and indemnify Kinetic Router against claims arising from your Content, misuse of the Services, or violation of these Terms or applicable law.'] },
  { title: '13. Notices', paragraphs: ['We may provide notices through the website, console, email, or official support channels. Keep your account contact information current.'] },
  { title: '14. Governing Rules and Dispute Resolution', paragraphs: ['These Terms are governed by the rules stated in the applicable service notice. Parties should first attempt to resolve disputes informally through good-faith discussion.'] },
  { title: '15. Contact', paragraphs: ['Questions about these Terms may be sent through the support channels identified on the Kinetic Router website.'] },
];
export default function TermsPage() { return <LegalPage title="Terms of Service" updated="June 4, 2026" intro="Welcome to Kinetic Router. These Terms of Service govern your access to and use of the Kinetic Router website, console, APIs, documentation, payments, support, and related services. The services are provided by Kinetic Router. By registering, accessing, or continuing to use the services, you agree to these Terms." sections={sections} />; }
