import { useState } from "react";
import { saveOnboarding } from "../lib/onboarding";
import { supabase } from "../lib/supabase";

interface OnboardingData {
  companyName: string;
  ownerName: string;
  phone: string;
  email: string;
  website: string;
  location: string;
  openTime: string;
  closeTime: string;
  emergency: boolean;
  emergencyPhone: string;
  days: string[];
  services: string[];
  inspectionPrice: string;
  repairPriceMin: string;
  repairPriceMax: string;
  financing: boolean;
  faqs: { question: string; answer: string }[];
  serviceRadius: string;
  yearsInBusiness: string;
  licenseNumber: string;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SERVICES = [
  "Roof Inspection",
  "Storm Damage Repair",
  "Full Replacement",
  "Emergency Repairs",
  "Insurance Claims",
];

export default function OnboardingWizard({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<OnboardingData>({
    companyName: "",
    ownerName: "",
    phone: "",
    email: "",
    website: "",
    location: "",
    openTime: "08:00",
    closeTime: "16:00",
    emergency: false,
    emergencyPhone: "",
    days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    services: [],
    inspectionPrice: "",
    repairPriceMin: "",
    repairPriceMax: "",
    financing: false,
    faqs: [
      { question: "", answer: "" },
      { question: "", answer: "" },
      { question: "", answer: "" },
    ],
    serviceRadius: "",
    yearsInBusiness: "",
    licenseNumber: "",
  });

  const update = (field: string, value: any) =>
    setData((prev) => ({ ...prev, [field]: value }));

  const toggleDay = (day: string) => {
    setData((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day],
    }));
  };

  const toggleService = (service: string) => {
    setData((prev) => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter((s) => s !== service)
        : [...prev.services, service],
    }));
  };

  const updateFaq = (index: number, field: string, value: string) => {
    const faqs = [...data.faqs];
    faqs[index] = { ...faqs[index], [field]: value };
    setData((prev) => ({ ...prev, faqs }));
  };

  const canProceed = () => {
    if (step === 1) {
      return (
        data.companyName &&
        data.ownerName &&
        data.phone &&
        data.email &&
        data.location
      );
    }
    if (step === 2) return data.days.length > 0;
    if (step === 3) return data.services.length > 0;
    return true;
  };

  const handleComplete = async () => {
    setSaving(true);
    setError("");
    try {
      const user = supabase ? (await supabase.auth.getUser()).data.user : null;

      if (user) {
        const result = await saveOnboarding(user.id, data);
        if (result.error) {
          setError(result.error);
          setSaving(false);
          return;
        }
      }
      localStorage.setItem("onboarding_complete", "true");
      onComplete();
    } catch (e) {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-gray-900 rounded-2xl p-8">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-lg">R</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">
              RoofFlow AI
            </h1>
            <p className="text-gray-400 text-sm">
              Setup your account
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between mb-2">
            {["Company", "Hours", "Services", "FAQ"].map((s, i) => (
              <span
                key={s}
                className={`text-xs font-medium ${
                  step === i + 1
                    ? "text-orange-500"
                    : step > i + 1
                    ? "text-green-500"
                    : "text-gray-500"
                }`}
              >
                {s}
              </span>
            ))}
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-orange-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
          <p className="text-gray-400 text-sm mt-2">
            Step {step} of 4
          </p>
        </div>

        {/* STEP 1 - Company */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-white text-2xl font-bold">
              Company Information
            </h2>
            <p className="text-gray-400">
              Tell us about your roofing company
            </p>
            <input
              className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
              placeholder="Company Name *"
              value={data.companyName}
              onChange={(e) => update("companyName", e.target.value)}
            />
            <input
              className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
              placeholder="Owner/Contact Name *"
              value={data.ownerName}
              onChange={(e) => update("ownerName", e.target.value)}
            />
            <input
              className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
              placeholder="Phone Number *"
              value={data.phone}
              onChange={(e) => update("phone", e.target.value)}
            />
            <input
              className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
              placeholder="Email *"
              value={data.email}
              onChange={(e) => update("email", e.target.value)}
            />
            <input
              className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
              placeholder="Website (optional)"
              value={data.website}
              onChange={(e) => update("website", e.target.value)}
            />
            <input
              className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
              placeholder="City/Location *"
              value={data.location}
              onChange={(e) => update("location", e.target.value)}
            />
          </div>
        )}

        {/* STEP 2 - Hours */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-white text-2xl font-bold">
              Business Hours
            </h2>
            <p className="text-gray-400">
              When are you available?
            </p>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-gray-400 text-sm mb-1 block">
                  Opening Time
                </label>
                <input
                  type="time"
                  className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
                  value={data.openTime}
                  onChange={(e) => update("openTime", e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="text-gray-400 text-sm mb-1 block">
                  Closing Time
                </label>
                <input
                  type="time"
                  className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
                  value={data.closeTime}
                  onChange={(e) => update("closeTime", e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-gray-400 text-sm mb-2 block">
                Working Days
              </label>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      data.days.includes(day)
                        ? "bg-orange-500 text-white"
                        : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => update("emergency", !data.emergency)}
                className={`w-12 h-6 rounded-full transition-all relative ${
                  data.emergency ? "bg-orange-500" : "bg-gray-700"
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${
                    data.emergency ? "left-6" : "left-0.5"
                  }`}
                />
              </button>
              <span className="text-white">
                Emergency/After-hours available
              </span>
            </div>
            {data.emergency && (
              <input
                className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
                placeholder="Emergency Phone Number"
                value={data.emergencyPhone}
                onChange={(e) =>
                  update("emergencyPhone", e.target.value)
                }
              />
            )}
          </div>
        )}

        {/* STEP 3 - Services */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-white text-2xl font-bold">
              Services & Pricing
            </h2>
            <p className="text-gray-400">What do you offer?</p>
            <div className="space-y-2">
              {SERVICES.map((service) => (
                <button
                  key={service}
                  onClick={() => toggleService(service)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                    data.services.includes(service)
                      ? "bg-orange-500/20 border border-orange-500 text-white"
                      : "bg-gray-800 border border-gray-700 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  <span className="mr-2">
                    {data.services.includes(service) ? "✅" : "⬜"}
                  </span>
                  {service}
                </button>
              ))}
            </div>
            <input
              className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
              placeholder="Typical Inspection Price (e.g. $150)"
              value={data.inspectionPrice}
              onChange={(e) =>
                update("inspectionPrice", e.target.value)
              }
            />
            <div className="flex gap-4">
              <input
                className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
                placeholder="Min Repair Price"
                value={data.repairPriceMin}
                onChange={(e) =>
                  update("repairPriceMin", e.target.value)
                }
              />
              <input
                className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
                placeholder="Max Repair Price"
                value={data.repairPriceMax}
                onChange={(e) =>
                  update("repairPriceMax", e.target.value)
                }
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => update("financing", !data.financing)}
                className={`w-12 h-6 rounded-full transition-all relative ${
                  data.financing ? "bg-orange-500" : "bg-gray-700"
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${
                    data.financing ? "left-6" : "left-0.5"
                  }`}
                />
              </button>
              <span className="text-white">Financing Available</span>
            </div>
          </div>
        )}

        {/* STEP 4 - FAQ */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-white text-2xl font-bold">
              FAQ & Extra Info
            </h2>
            <p className="text-gray-400">
              Optional - helps your AI chatbot answer better
            </p>
            {data.faqs.map((faq, i) => (
              <div
                key={i}
                className="space-y-2 p-4 bg-gray-800 rounded-lg"
              >
                <p className="text-gray-400 text-sm">FAQ {i + 1}</p>
                <input
                  className="w-full bg-gray-900 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
                  placeholder={`Question ${i + 1}`}
                  value={faq.question}
                  onChange={(e) =>
                    updateFaq(i, "question", e.target.value)
                  }
                />
                <textarea
                  className="w-full bg-gray-900 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none resize-none"
                  placeholder="Answer..."
                  rows={2}
                  value={faq.answer}
                  onChange={(e) =>
                    updateFaq(i, "answer", e.target.value)
                  }
                />
              </div>
            ))}
            <input
              className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
              placeholder="Service Radius in miles (e.g. 50)"
              value={data.serviceRadius}
              onChange={(e) => update("serviceRadius", e.target.value)}
            />
            <input
              className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
              placeholder="Years in Business"
              value={data.yearsInBusiness}
              onChange={(e) =>
                update("yearsInBusiness", e.target.value)
              }
            />
            <input
              className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-orange-500 outline-none"
              placeholder="License Number (optional)"
              value={data.licenseNumber}
              onChange={(e) => update("licenseNumber", e.target.value)}
            />
          </div>
        )}

        {/* Error Message */}
        {error && (
          <p className="text-red-400 text-sm mt-4 p-3 bg-red-900/20 rounded-lg">
            ⚠️ {error}
          </p>
        )}

        {/* Buttons */}
        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={saving}
              className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-all"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}
          <div className="flex gap-3">
            {step === 4 && (
              <button
                onClick={onComplete}
                disabled={saving}
                className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-all"
              >
                Skip
              </button>
            )}
            <button
              onClick={() => {
                if (step < 4) setStep((s) => s + 1);
                else handleComplete();
              }}
              disabled={!canProceed() || saving}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                canProceed() && !saving
                  ? "bg-orange-500 text-white hover:bg-orange-600"
                  : "bg-gray-700 text-gray-500 cursor-not-allowed"
              }`}
            >
              {saving
                ? "Saving..."
                : step === 4
                ? "Complete Setup ✓"
                : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
  }
