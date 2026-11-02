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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
          <Calendar className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-white">Calendar Integration</h3>
          <p className="text-xs text-slate-400">
            Sync inspections and appointments with your calendar.
          </p>
        </div>
        {isConnected && (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle className="h-4 w-4" />
            Connected
          </span>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-800 pt-4">
        <div className="text-xs text-slate-400">
          {isConnected
            ? 'Your calendar is connected and ready to sync.'
            : 'Connect your calendar to manage appointments.'}
        </div>
        {isConnected ? (
          <button
            onClick={onDisconnect}
            className="text-xs font-bold text-red-400 hover:text-red-300"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            className="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-xs font-bold text-white hover:bg-blue-400"
          >
            Connect Calendar
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>

      {isConnected && (
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <RefreshCw className="h-3 w-3" />
          Calendar sync is enabled.
        </div>
      )}
    </div>
  );
};

export default CalendarConnection;
