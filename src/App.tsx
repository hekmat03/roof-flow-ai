import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Agent1Chatbot } from './components/Agent1Chatbot';
import { Agent2PhoneCall } from './components/Agent2PhoneCall';
import { Agent3SMSEmail } from './components/Agent3SMSEmail';
import { Agent4Estimate } from './components/Agent4Estimate';
import { CRMLeadsBoard } from './components/CRMLeadsBoard';
import { Configuration } from './components/Configuration';
import { PromptPlayground } from './components/PromptPlayground';
import { FallbackNotice } from './components/FallbackNotice';

function MainAppContent() {
  const { activeTab } = useApp();

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'agent1':
        return <Agent1Chatbot />;
      case 'agent2':
        return <Agent2PhoneCall />;
      case 'agent3':
        return <Agent3SMSEmail />;
      case 'agent4':
        return <Agent4Estimate />;
      case 'crm':
        return <CRMLeadsBoard />;
      case 'config':
        return <Configuration />;
      case 'prompts':
        return <PromptPlayground />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout>
      <div key={activeTab} className="animate-tab-in h-full">
        {renderContent()}
      </div>
      {/* Non-intrusive "built-in engine" toast when live AI is unavailable */}
      <FallbackNotice />
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
}
