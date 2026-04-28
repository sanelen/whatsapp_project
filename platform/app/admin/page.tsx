'use client';

import { useEffect, useRef, useState } from 'react';
import { supabaseClient } from '@/lib/supabase';
import type { Conversation, Message, Customer } from '@/lib/types';

interface ConversationWithDetails extends Conversation {
  customer?: Customer;
  messages?: Message[];
}

interface WebhookStatusData {
  state: 'live' | 'stale' | 'offline' | 'no-signal';
  latestSuccessAt: string | null;
  secondsSinceSuccess: number | null;
  latestEvent: {
    event_type: string;
    status: 'success' | 'failed' | 'processing';
    created_at: string;
    error_message?: string | null;
  } | null;
}

export default function AdminPage() {
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatusData | null>(null);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const fetchDashboardData = async (isBackgroundRefresh = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      if (!supabaseClient) {
        throw new Error('Supabase is not configured in this environment');
      }

      if (isBackgroundRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Fetch webhook heartbeat from server-side endpoint
      const statusResponse = await fetch('/api/admin/webhook-status', { cache: 'no-store' });
      if (statusResponse.ok) {
        const statusJson = await statusResponse.json();
        if (statusJson?.success && statusJson?.data) {
          setWebhookStatus(statusJson.data as WebhookStatusData);
        }
      }

      // Fetch conversations with customer data
      const { data: convData, error: convError } = await supabaseClient
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false })
        .limit(10);

      if (convError) throw convError;

      // For each conversation, fetch customer and messages
      const enriched = await Promise.all(
        (convData || []).map(async (conv) => {
          const { data: customerData } = await supabaseClient
            .from('customers')
            .select('*')
            .eq('id', conv.customer_id)
            .single();

          const { data: messageData } = await supabaseClient
            .from('messages')
            .select('*')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(5);

          return {
            ...conv,
            customer: customerData,
            messages: messageData,
          };
        })
      );

      setConversations(enriched);
      setLastRefreshAt(new Date().toISOString());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load conversations';
      setError(message);
      console.error('Error fetching conversations:', err);
    } finally {
      inFlightRef.current = false;
      if (isBackgroundRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const initialFetchId = window.setTimeout(() => {
      fetchDashboardData(false);
    }, 0);

    const intervalId = window.setInterval(() => {
      fetchDashboardData(true);
    }, 15000);

    return () => {
      window.clearTimeout(initialFetchId);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!supabaseClient) {
      return;
    }

    const channel = supabaseClient
      .channel('admin-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        fetchDashboardData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        fetchDashboardData(true);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'webhooks_log' }, () => {
        fetchDashboardData(true);
      })
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="text-center">
          <p className="text-gray-600">Loading conversations...</p>
        </div>
      </div>
    );
  }

  const statusTone =
    webhookStatus?.state === 'live'
      ? 'bg-green-100 text-green-800'
      : webhookStatus?.state === 'stale'
        ? 'bg-yellow-100 text-yellow-800'
        : webhookStatus?.state === 'offline'
          ? 'bg-red-100 text-red-800'
          : 'bg-gray-100 text-gray-800';

  const statusLabel =
    webhookStatus?.state === 'live'
      ? 'Webhook Live'
      : webhookStatus?.state === 'stale'
        ? 'Webhook Stale'
        : webhookStatus?.state === 'offline'
          ? 'Webhook Offline'
          : 'No Webhook Signal';

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">WhatsApp Admin Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Auto-refresh: every 15 seconds
              {lastRefreshAt ? ` • Last refresh: ${new Date(lastRefreshAt).toLocaleTimeString()}` : ''}
              {refreshing ? ' • Refreshing...' : ''}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusTone}`}>
            {statusLabel}
          </span>
        </div>

        <div className="mb-4">
          <button
            onClick={() => fetchDashboardData(true)}
            className="px-3 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800"
          >
            Refresh now
          </button>
        </div>

        <div className="mb-6 p-4 bg-white border border-gray-200 rounded-lg">
          <p className="text-sm text-gray-700">
            Last successful webhook:{' '}
            <span className="font-medium">
              {webhookStatus?.latestSuccessAt
                ? new Date(webhookStatus.latestSuccessAt).toLocaleString()
                : 'No successful webhook yet'}
            </span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Latest event:{' '}
            {webhookStatus?.latestEvent
              ? `${webhookStatus.latestEvent.event_type} (${webhookStatus.latestEvent.status}) at ${new Date(webhookStatus.latestEvent.created_at).toLocaleString()}`
              : 'No webhook activity recorded'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">Error: {error}</p>
          </div>
        )}

        {conversations.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">No conversations yet</p>
          </div>
        ) : (
          <div className="space-y-6">
            {conversations.map((conversation) => (
              <div key={conversation.id} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {conversation.customer?.name || conversation.customer?.phone_number || 'Unknown'}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {conversation.customer?.phone_number}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      conversation.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : conversation.status === 'closed'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {conversation.status}
                  </span>
                </div>

                <div className="mb-4 text-sm text-gray-600">
                  <p>Last message: {new Date(conversation.last_message_at).toLocaleString()}</p>
                </div>

                <div className="space-y-2 bg-gray-50 rounded p-4 max-h-40 overflow-y-auto">
                  {conversation.messages && conversation.messages.length > 0 ? (
                    conversation.messages.map((msg) => (
                      <div key={msg.id} className="text-sm">
                        <span
                          className={`font-medium ${
                            msg.direction === 'inbound' ? 'text-blue-600' : 'text-green-600'
                          }`}
                        >
                          {msg.direction === 'inbound' ? '← Inbound' : '→ Outbound'}
                        </span>
                        : <span className="text-gray-700">{msg.content}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm">No messages</p>
                  )}
                </div>

                <div className="mt-4 text-xs text-gray-500">
                  Created: {new Date(conversation.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
