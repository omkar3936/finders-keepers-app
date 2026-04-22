import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { Camera, CheckCircle2, Clock3, Compass, LogOut, MapPin, ShieldCheck, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ItemReport = Database["public"]["Tables"]["item_reports"]["Row"];
type ReportStatus = Database["public"]["Enums"]["report_status"];
type ReportWithImage = ItemReport & { signedImageUrl?: string };

const statusStyles: Record<ReportStatus, string> = {
  pending: "bg-warning/20 text-warning-foreground border-warning/40",
  verified: "bg-primary/10 text-primary border-primary/30",
  matched: "bg-accent/10 text-accent border-accent/30",
  resolved: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
};

const categoryOptions = [
  "Keys / Keychain",
  "Mobile Phone",
  "Laptop",
  "Wallet / Purse",
  "ID Cards / Documents",
  "Bags / Backpack",
  "Jewelry / Watch",
  "Earphones / Headphones",
  "Books / Notebook",
  "Clothing",
  "Pets",
  "Other",
];

const AdminDashboard = () => {
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [adminReports, setAdminReports] = useState<ReportWithImage[]>([]);
  const [adminDraft, setAdminDraft] = useState<Record<string, { status: ReportStatus; solution: string; admin_notes: string }>>({});
  const [categoryFilter, setCategoryFilter] = useState("all");

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setAuthChecked(true);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setIsAdmin(false);
      setAdminReports([]);
      return;
    }

    void loadAdminReports();
  }, [session?.user?.id]);

  const stats = useMemo(() => ({
    pending: adminReports.filter((report) => report.status === "pending").length,
    verified: adminReports.filter((report) => report.status === "verified" || report.status === "matched").length,
    resolved: adminReports.filter((report) => report.status === "resolved").length,
  }), [adminReports]);

  const categories = useMemo(
    () => Array.from(new Set([...categoryOptions, ...adminReports.map((report) => report.category)])).sort(),
    [adminReports],
  );

  const filteredReports = useMemo(
    () => categoryFilter === "all" ? adminReports : adminReports.filter((report) => report.category === categoryFilter),
    [adminReports, categoryFilter],
  );

  const signUrls = async (items: ItemReport[]): Promise<ReportWithImage[]> => Promise.all(
    items.map(async (report) => {
      if (!report.image_url) return report;
      const { data } = await supabase.storage.from("item-images").createSignedUrl(report.image_url, 3600);
      return { ...report, signedImageUrl: data?.signedUrl };
    }),
  );

  const loadAdminReports = async () => {
    if (!session?.user) return;
    setLoadingReports(true);
    try {
      const { data: roleData } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" });
      setIsAdmin(Boolean(roleData));
      if (!roleData) return;

      const { data, error } = await supabase.from("item_reports").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;

      const signed = await signUrls(data ?? []);
      setAdminReports(signed);
      setAdminDraft(
        signed.reduce<Record<string, { status: ReportStatus; solution: string; admin_notes: string }>>((acc, report) => {
          acc[report.id] = {
            status: report.status,
            solution: report.solution ?? "",
            admin_notes: report.admin_notes ?? "",
          };
          return acc;
        }, {}),
      );
    } catch (error) {
      toast({ title: "Could not load admin reports", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setLoadingReports(false);
    }
  };

  const updateReport = async (report: ItemReport) => {
    if (!session?.user || !adminDraft[report.id]) return;
    const draft = adminDraft[report.id];
    const isVerifiedState = draft.status === "verified" || draft.status === "matched" || draft.status === "resolved";
    const { error } = await supabase
      .from("item_reports")
      .update({
        status: draft.status,
        solution: draft.solution.trim() || null,
        admin_notes: draft.admin_notes.trim() || null,
        verified_by: isVerifiedState ? session.user.id : report.verified_by,
        verified_at: isVerifiedState ? new Date().toISOString() : report.verified_at,
      })
      .eq("id", report.id);

    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Report updated", description: "Verification status and solution were saved." });
    await loadAdminReports();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const renderReportCard = (report: ReportWithImage) => (
    <article key={report.id} className="group overflow-hidden rounded-lg border bg-card shadow-card transition-all hover:-translate-y-1 hover:shadow-soft">
      <div className="grid gap-0 md:grid-cols-[210px_1fr]">
        <div className="relative min-h-44 bg-muted">
          {report.signedImageUrl ? (
            <img src={report.signedImageUrl} alt={`${report.item_name} report`} className="h-full min-h-44 w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full min-h-44 items-center justify-center bg-soft-gradient text-muted-foreground">
              <Camera className="h-10 w-10" aria-hidden="true" />
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-full border bg-surface/90 px-3 py-1 text-xs font-semibold capitalize backdrop-blur">
            {report.report_type}
          </span>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight">{report.item_name}</h2>
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" aria-hidden="true" /> {report.location}
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold capitalize ${statusStyles[report.status]}`}>{report.status}</span>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{report.description}</p>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
            <span className="rounded-full bg-muted px-3 py-1">{report.category}</span>
            <span className="rounded-full bg-muted px-3 py-1">{report.event_date || "Date not specified"}</span>
            <span className="rounded-full bg-muted px-3 py-1">Reporter: {report.contact_name}</span>
            <span className="rounded-full bg-muted px-3 py-1">Phone: {report.contact_phone || "Not provided"}</span>
            <span className="rounded-full bg-muted px-3 py-1">Email: {report.contact_email || "Not provided"}</span>
          </div>
          {adminDraft[report.id] && (
            <div className="grid gap-3 border-t pt-4 md:grid-cols-[160px_1fr_1fr_auto]">
              <Select
                value={adminDraft[report.id].status}
                onValueChange={(value: ReportStatus) => setAdminDraft((draft) => ({ ...draft, [report.id]: { ...draft[report.id], status: value } }))}
              >
                <SelectTrigger aria-label="Report status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["pending", "verified", "matched", "resolved", "rejected"] as ReportStatus[]).map((status) => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={adminDraft[report.id].solution}
                placeholder="Solution for reporter"
                onChange={(event) => setAdminDraft((draft) => ({ ...draft, [report.id]: { ...draft[report.id], solution: event.target.value } }))}
              />
              <Input
                value={adminDraft[report.id].admin_notes}
                placeholder="Internal admin notes"
                onChange={(event) => setAdminDraft((draft) => ({ ...draft, [report.id]: { ...draft[report.id], admin_notes: event.target.value } }))}
              />
              <Button variant="trust" onClick={() => updateReport(report)}>Save</Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );

  if (authChecked && !session) return <Navigate to="/" replace />;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-surface/90 backdrop-blur">
        <div className="container flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-hero-gradient text-primary-foreground shadow-card">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-primary">ReclaimIt Admin</p>
              <h1 className="text-2xl font-black tracking-tight">Admin Dashboard</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="trust" onClick={signOut}><LogOut className="h-4 w-4" aria-hidden="true" /> Sign out</Button>
          </div>
        </div>
      </header>

      <section className="container py-8">
        {!authChecked || loadingReports ? (
          <p className="text-muted-foreground">Loading admin dashboard...</p>
        ) : !isAdmin ? (
          <div className="rounded-lg border bg-card p-8 text-center shadow-card">
            <Compass className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden="true" />
            <p className="font-bold">Admin access required</p>
            <p className="text-sm text-muted-foreground">Only verified admins can view submitted reports here.</p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="grid gap-4 md:grid-cols-3">
              {([
                [Clock3, stats.pending, "Pending submissions"],
                [ShieldCheck, stats.verified, "Verified or matched"],
                [CheckCircle2, stats.resolved, "Resolved handoffs"],
              ] satisfies Array<[LucideIcon, number, string]>).map(([Icon, value, label]) => (
                <div key={String(label)} className="rounded-lg border bg-card p-5 shadow-card">
                  <Icon className="mb-4 h-6 w-6 text-primary" aria-hidden="true" />
                  <p className="text-3xl font-black">{String(value)}</p>
                  <p className="text-sm text-muted-foreground">{String(label)}</p>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-2xl font-black">Submitted reports</h2>
                  <p className="text-sm text-muted-foreground">Verify reports, mark matches, reject duplicates, and provide the final solution.</p>
                </div>
                <div className="w-full md:w-64">
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger aria-label="Filter reports by category">
                      <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {filteredReports.length ? filteredReports.map(renderReportCard) : (
                <div className="rounded-lg border bg-card p-8 text-center shadow-card">
                  <ShieldCheck className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden="true" />
                  <p className="font-bold">No submitted reports available</p>
                  <p className="text-sm text-muted-foreground">{adminReports.length ? "No reports match this category." : "New submissions will appear here once users report items."}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
};

export default AdminDashboard;
