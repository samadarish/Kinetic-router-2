import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
import { getPageMeta } from '@/data/content';

const fallbackPage = getPageMeta('/privacy');
const fallbackMetadata: Metadata = { title: fallbackPage?.title ?? 'Privacy Policy', description: fallbackPage?.description };

export const metadata = fallbackMetadata;
const sections = [
  { title: '1. Scope', paragraphs: ['This Privacy Policy explains how kineticRouter handles information when you use our website, account services, API gateway, documentation, and related services.'] },
  { title: '2. Information We Collect', paragraphs: ['We collect account details you provide, transaction and billing records, API credentials, request metadata, device and browser information, and support communications.'], bullets: ['Account and contact information', 'Usage, latency, model, token, and cost records', 'Payment and credit transaction records', 'Security and diagnostic logs'] },
  { title: '3. How We Use Information', paragraphs: ['We use information to provide and secure the service, route API requests, calculate usage and costs, improve reliability, prevent abuse, communicate with you, and meet legal obligations.'] },
  { title: '4. API Content and Upstream Providers', paragraphs: ['Prompts, files, and model outputs may be transmitted to the upstream provider selected for a request. Upstream providers process that content under their own applicable terms and policies. Do not submit content you are not authorized to process.'] },
  { title: '5. Cookies and Similar Technologies', paragraphs: ['We use necessary browser storage and cookies for authentication, preferences, security, and service operation. We may use limited analytics to understand product performance.'] },
  { title: '6. Sharing and Disclosure', paragraphs: ['We share information with infrastructure, payment, authentication, support, and upstream model providers as needed to deliver the service. We may disclose information when required by law or to protect users and the service.'] },
  { title: '7. Retention', paragraphs: ['We retain information for as long as needed to provide the service, maintain financial and security records, resolve disputes, and meet legal obligations. Retention periods vary by data type and account status.'] },
  { title: '8. Security', paragraphs: ['We use administrative, technical, and organizational safeguards designed to protect information. No online service can guarantee absolute security, so protect your API keys and report suspected compromise promptly.'] },
  { title: '9. Your Rights', paragraphs: ['Depending on your location, you may have rights to access, correct, delete, restrict, or obtain a copy of personal information. Contact us to make a request; we may need to verify your identity.'] },
  { title: '10. Cross-Border and Third-Party Processing', paragraphs: ['Service providers and upstream model providers may process information in countries other than your own. We use appropriate measures where required for those transfers.'] },
  { title: '11. Minors', paragraphs: ['The service is not directed to children and must not be used by anyone below the minimum age required in their jurisdiction.'] },
  { title: '12. Updates', paragraphs: ['We may update this policy as the service and applicable requirements change. The posted effective date identifies the latest version.'] },
  { title: '13. Disputes and Complaints', paragraphs: ['Contact us first with any privacy concern so we can investigate and respond. You may also have the right to contact your local data protection authority.'] },
  { title: '14. Other Terms', paragraphs: ['This policy should be read together with the kineticRouter Terms of Service and any additional terms presented for a specific feature.'] },
  { title: '15. Contact', paragraphs: ['For privacy questions or requests, use the support channel available in your customer console.'] },
];
export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" updated="June 4, 2026" intro="kineticRouter operates the kineticRouter website, console, APIs, payments, support, and related services. This Privacy Policy explains how we collect, use, retain, share, and protect personal information, API usage data, and related logs, and how you may exercise your rights." sections={sections} />;
}
