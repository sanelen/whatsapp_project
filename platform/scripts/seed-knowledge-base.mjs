import { createClient } from '@supabase/supabase-js';

/**
 * Knowledge Base Seeding Script
 * Run: node scripts/seed-knowledge-base.mjs
 * 
 * Seeds the knowledge_base table with sample FAQ and product information
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const knowledgeBase = [
  // Product/Service Information
  {
    category: 'Product Information',
    title: 'What is our main product?',
    content: 'We offer an AI-powered customer service platform that helps businesses automate and manage customer conversations across multiple channels including WhatsApp, email, and web chat.',
    tags: ['product', 'overview', 'service'],
    is_active: true,
  },
  {
    category: 'Product Information',
    title: 'What are the key features?',
    content: 'Our platform includes: real-time chat management, AI-powered responses, conversation history, customer profiles, automated workflows, analytics dashboard, and 24/7 availability.',
    tags: ['features', 'product', 'capabilities'],
    is_active: true,
  },
  {
    category: 'Product Information',
    title: 'Is there a free trial?',
    content: 'Yes! We offer a 14-day free trial with full access to all features. No credit card required. You can upgrade to a paid plan anytime during or after your trial.',
    tags: ['pricing', 'trial', 'signup'],
    is_active: true,
  },

  // Support & Troubleshooting
  {
    category: 'Support',
    title: 'How do I contact support?',
    content: 'You can reach our support team via email at support@example.com, through the chat widget in your dashboard, or by calling +1-800-123-4567. We typically respond within 2 hours during business hours (9 AM - 6 PM EST).',
    tags: ['support', 'contact', 'help'],
    is_active: true,
  },
  {
    category: 'Support',
    title: 'What should I do if I forget my password?',
    content: 'Click "Forgot Password" on the login page. We\'ll send you a reset link to your registered email address. Follow the link to create a new password. The link expires after 1 hour for security.',
    tags: ['password', 'login', 'account', 'security'],
    is_active: true,
  },
  {
    category: 'Support',
    title: 'How do I enable two-factor authentication?',
    content: 'Go to Account Settings > Security > Enable Two-Factor Authentication. You\'ll need to verify your phone number and download an authenticator app like Google Authenticator or Authy.',
    tags: ['security', '2fa', 'authentication'],
    is_active: true,
  },

  // Account & Billing
  {
    category: 'Account',
    title: 'How do I upgrade my plan?',
    content: 'Visit your Dashboard > Billing > Plans. Select your desired plan and follow the checkout process. Your new features will be active immediately, and billing will be prorated for the current cycle.',
    tags: ['billing', 'upgrade', 'plan'],
    is_active: true,
  },
  {
    category: 'Account',
    title: 'What payment methods do you accept?',
    content: 'We accept all major credit cards (Visa, Mastercard, American Express), PayPal, and wire transfers for annual plans. Invoicing is also available for enterprise customers.',
    tags: ['payment', 'billing', 'invoice'],
    is_active: true,
  },
  {
    category: 'Account',
    title: 'Can I cancel anytime?',
    content: 'Yes! You can cancel your subscription anytime from your billing dashboard. Cancellation takes effect at the end of your current billing cycle. No cancellation fees apply.',
    tags: ['cancel', 'billing', 'refund'],
    is_active: true,
  },

  // Integration & Technical
  {
    category: 'Integration',
    title: 'How do I integrate with WhatsApp?',
    content: 'Go to Settings > Integrations > WhatsApp. Follow the setup wizard which will guide you to connect your WhatsApp Business Account. You\'ll need to verify your phone number and accept WhatsApp\'s terms.',
    tags: ['whatsapp', 'integration', 'setup'],
    is_active: true,
  },
  {
    category: 'Integration',
    title: 'What is the API rate limit?',
    content: 'Our API allows up to 10,000 requests per hour on starter plans and unlimited on professional plans. Rate limiting is per conversation thread, not globally. Contact support for higher limits.',
    tags: ['api', 'rate-limit', 'technical'],
    is_active: true,
  },
  {
    category: 'Integration',
    title: 'Do you have webhooks?',
    content: 'Yes! We provide webhooks for message events, conversation updates, and customer actions. Configure them in Settings > Webhooks. Each event includes full payload details in JSON format.',
    tags: ['webhooks', 'api', 'integration'],
    is_active: true,
  },

  // Best Practices
  {
    category: 'Best Practices',
    title: 'How should I set up my knowledge base?',
    content: 'Organize your KB by categories (FAQs, Troubleshooting, etc.). Use clear titles and include relevant tags. Keep content concise (under 300 words). Test responses with sample queries to ensure accuracy.',
    tags: ['knowledge-base', 'setup', 'best-practice'],
    is_active: true,
  },
  {
    category: 'Best Practices',
    title: 'How can I improve response accuracy?',
    content: 'Add more knowledge base entries covering common customer questions. Use specific keywords in titles and tags. Monitor conversation analytics to identify gaps. Regularly review and update outdated information.',
    tags: ['accuracy', 'quality', 'improvement'],
    is_active: true,
  },
  {
    category: 'Best Practices',
    title: 'When should I escalate to a human agent?',
    content: 'Escalate for: sensitive issues (billing, complaints), requests outside KB scope, if customer asks for human, when AI confidence is low, or for complex troubleshooting. Always offer escalation option.',
    tags: ['escalation', 'workflow', 'human-handoff'],
    is_active: true,
  },
];

async function seedKnowledgeBase() {
  try {
    console.log('🌱 Starting knowledge base seeding...');

    // Check if data already exists
    const { count } = await supabase
      .from('knowledge_base')
      .select('*', { count: 'exact', head: true });

    if (count && count > 0) {
      console.log(`⚠️  Knowledge base already has ${count} entries. Skipping seeding.`);
      console.log('💡 Tip: To reseed, manually delete from knowledge_base table in Supabase.');
      process.exit(0);
    }

    // Insert knowledge base entries
    const { error } = await supabase
      .from('knowledge_base')
      .insert(knowledgeBase);

    if (error) {
      console.error('❌ Error seeding knowledge base:', error);
      process.exit(1);
    }

    console.log(`✅ Successfully seeded ${knowledgeBase.length} knowledge base entries`);
    console.log('📊 Categories:');
    const categories = [...new Set(knowledgeBase.map((kb) => kb.category))];
    categories.forEach((cat) => {
      const count = knowledgeBase.filter((kb) => kb.category === cat).length;
      console.log(`   - ${cat}: ${count} entries`);
    });
    console.log('\n🎯 Next steps:');
    console.log('   1. Test the chatbot by sending a WhatsApp message');
    console.log('   2. Verify responses match knowledge base entries');
    console.log('   3. Add more entries as needed in Supabase');

    process.exit(0);
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

seedKnowledgeBase();
