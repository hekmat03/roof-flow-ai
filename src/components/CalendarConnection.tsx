import React from 'react';
import { Calendar, CheckCircle, ExternalLink, RefreshCw } from 'lucide-react';

interface CalendarConnectionProps {
  isConnected?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

const CalendarConnection: React.FC<CalendarConnectionProps> = ({
  isConnected = false,
  onConnect,
  onDisconnect,
}) => {
  return (
    <div className="bg-card border border-line rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-gold/10 text-gold">
          <Calendar className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-ink">Calendar Integration</h3>
          <p className="text-xs text-ink-mute">
            Sync inspections and appointments with your calendar.
          </p>
        </div>
        {isConnected && (
          <span className="flex items-center gap-1 text-xs text-gold">
            <CheckCircle className="h-4 w-4" />
            Connected
          </span>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line pt-4">
        <div className="text-xs text-ink-mute">
          {isConnected
            ? 'Your calendar is connected and ready to sync.'
            : 'Connect your calendar to manage appointments.'}
        </div>
        {isConnected ? (
          <button
            onClick={onDisconnect}
            className="text-xs font-bold text-danger hover:text-danger"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            className="flex items-center gap-2 rounded-lg bg-gold px-3 py-2 text-xs font-bold text-ink hover:bg-gold"
          >
            Connect Calendar
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>

      {isConnected && (
        <div className="flex items-center gap-2 text-[11px] text-ink-mute">
          <RefreshCw className="h-3 w-3" />
          Calendar sync is enabled.
        </div>
      )}
    </div>
  );
};

export default CalendarConnection;
