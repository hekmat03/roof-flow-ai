import React from 'react';
import { LEGAL } from '../../lib/legal';
import { LegalPage, type LegalSection } from './LegalPage';

const sections: LegalSection[] = [
  {
    heading: 'Who we are and our role',
    body: (
      <>
        <p>
          {LEGAL.productName} is operated by {LEGAL.companyName} ("we", "us"). It is a platform that lets roofing
          contractors ("Customers") capture and follow up with homeowner enquiries.
        </p>
        <p>
          For account and billing data about Customers, we are the data controller. For information about homeowners
          submitted through a Customer's chat widget or CRM ("Lead Data"), the Customer decides why and how it is used
          and we process it on the Customer's behalf. If you are a homeowner, the contractor you contacted is your
          primary point of contact for that data.
        </p>
      </>
    ),
  },
  {
    heading: 'Information we collect',
    body: (
      <ul>
        <li><strong>Account data:</strong> email address, password (stored hashed by our authentication provider), and team membership and role.</li>
        <li><strong>Business profile:</strong> company name, business email, business mailing address, location and the settings and prompts you configure.</li>
        <li><strong>Lead Data:</strong> name, email, phone number, property ZIP code, description of the roof concern, conversation content, notes, status, and the follow-up consent you give in the widget.</li>
        <li><strong>Chat and agent content:</strong> messages you or a visitor type into the chatbot, and the replies generated.</li>
        <li><strong>Email follow-up data:</strong> scheduled and sent messages, recipient address, opt-out and suppression records.</li>
        <li><strong>Calendar data (optional):</strong> if you connect Google Calendar, we store an encrypted access token and read and write events needed to book inspections.</li>
        <li><strong>Billing data:</strong> subscription status and customer identifiers from our payment provider. We do not store full card numbers.</li>
        <li><strong>Technical data:</strong> IP address (used for rate limiting and abuse prevention), request logs and usage counts.</li>
      </ul>
    ),
  },
  {
    heading: 'How we use information',
    body: (
      <ul>
        <li>To provide, secure and support the service, including the CRM, chat widget, follow-up emails and calendar booking.</li>
        <li>To generate AI replies to chat messages.</li>
        <li>To send service emails such as verification, password reset and team invitations.</li>
        <li>To enforce usage limits, prevent abuse and fraud, and meet legal obligations.</li>
        <li>To process payments and manage subscriptions.</li>
      </ul>
    ),
  },
  {
    heading: 'AI processing',
    body: (
      <p>
        Chat messages and relevant lead context are sent to our AI provider(s) ([xAI / Groq – keep the one you use])
        to generate replies. Please do not enter sensitive information such as payment card numbers, government
        identifiers or health information into the chat. [Confirm: we do not use your content to train our own models.]
      </p>
    ),
  },
  {
    heading: 'Service providers',
    body: (
      <>
        <p>We share information only with providers that help us run the service, under their own terms and privacy policies:</p>
        <ul>
          <li>Supabase – database and authentication</li>
          <li>Vercel – hosting and serverless functions</li>
          <li>[xAI or Groq] – AI response generation</li>
          <li>Resend – sending email</li>
          <li>Google – Calendar integration, only if you connect it</li>
          <li>Lemon Squeezy – payments and subscription billing</li>
        </ul>
        <p>We do not sell personal information. We may disclose information if required by law or to protect rights and safety.</p>
      </>
    ),
  },
  {
    heading: 'Email and opting out',
    body: (
      <p>
        Follow-up emails are sent on behalf of a contractor only to leads who gave consent and, where required,
        confirmed their email address. Every follow-up includes the contractor's business address and an unsubscribe
        link. Unsubscribing adds your address to a suppression list so it is not contacted again by that contractor
        through {LEGAL.productName}.
      </p>
    ),
  },
  {
    heading: 'Data retention',
    body: (
      <p>
        We keep account data while your account is active and Lead Data until the Customer deletes it or closes the
        account. After account closure we delete or anonymise data within [XX] days, except where we must retain it
        for legal, security or billing reasons. Suppression records are kept so that opt-outs continue to be honoured.
      </p>
    ),
  },
  {
    heading: 'Security',
    body: (
      <p>
        Data is stored per company with access controls that separate one Customer's records from another's, traffic
        is encrypted in transit, and third-party tokens are encrypted at rest. No system is perfectly secure, so we
        cannot guarantee absolute security.
      </p>
    ),
  },
  {
    heading: 'Cookies and local storage',
    body: (
      <p>
        We use browser storage that is strictly necessary to keep you signed in and to run the app. We do not use
        advertising cookies. [Update this section if you add analytics.]
      </p>
    ),
  },
  {
    heading: 'Your rights',
    body: (
      <p>
        Depending on where you live, you may have the right to access, correct, delete or export your personal
        information, or to object to or restrict certain processing. Customers can manage most data directly in the
        app. Homeowners should first contact the contractor they enquired with; you can also email us at{' '}
        {LEGAL.contactEmail} and we will route or answer your request. You may also complain to your local data
        protection authority.
      </p>
    ),
  },
  {
    heading: 'Children',
    body: <p>The service is for businesses and is not directed to children under 16. We do not knowingly collect their information.</p>,
  },
  {
    heading: 'International transfers',
    body: <p>Our providers may process data in the United States and other countries. Where required, we rely on appropriate safeguards for such transfers.</p>,
  },
  {
    heading: 'Changes to this policy',
    body: <p>We may update this policy. We will change the "Last updated" date and, for material changes, notify Customers by email or in the app.</p>,
  },
  {
    heading: 'Contact',
    body: (
      <p>
        {LEGAL.companyName}, {LEGAL.mailingAddress}
        <br />
        Email: {LEGAL.contactEmail}
      </p>
    ),
  },
];

export function PrivacyPolicy() {
  return <LegalPage title="Privacy Policy" sections={sections} />;
}
