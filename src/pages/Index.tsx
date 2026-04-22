import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import {
  ArchiveRestore,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  Compass,
  Laptop,
  ImagePlus,
  LogOut,
  MapPin,
  PackageSearch,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  WalletCards,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ItemReport = Database["public"]["Tables"]["item_reports"]["Row"];
type ReportStatus = Database["public"]["Enums"]["report_status"];
type ReportType = Database["public"]["Enums"]["report_type"];

type ReportWithImage = ItemReport & { signedImageUrl?: string };

const reportSchema = z.object({
  report_type: z.enum(["lost", "found"]),
  item_name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  location: z.string().trim().min(2).max(160),
  event_date: z.string().optional(),
  description: z.string().trim().min(10).max(1200),
  contact_name: z.string().trim().min(2).max(120),
  contact_phone: z.string().trim().max(40).optional(),
  contact_email: z.string().trim().email().max(255).optional().or(z.literal("")),
});

const statusStyles: Record<ReportStatus, string> = {
  pending: "bg-warning/20 text-warning-foreground border-warning/40",
  verified: "bg-primary/10 text-primary border-primary/30",
  matched: "bg-accent/10 text-accent border-accent/30",
  resolved: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
};

const categories = [
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

const defaultReport = {
  report_type: "lost" as ReportType,
  item_name: "",
  category: "",
  location: "",
  event_date: "",
  description: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
};

const heroHighlights = [
  { icon: Phone, label: "Mobile", status: "Matched near library" },
  { icon: Laptop, label: "Laptop", status: "Awaiting owner proof" },
  { icon: WalletCards, label: "Wallet", status: "Verified by admin" },
] satisfies Array<{ icon: LucideIcon; label: string; status: string }>;

const Index = () => {
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [form, setForm] = useState(defaultReport);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reports, setReports] = useState<ReportWithImage[]>([]);
  const [myReports, setMyReports] = useState<ReportWithImage[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setIsAdmin(false);
      setReports([]);
      setMyReports([]);
      return;
    }

    setForm((current) => ({
      ...current,
      contact_name: current.contact_name || session.user.user_metadata?.display_name || session.user.email?.split("@")[0] || "",
      contact_email: current.contact_email || session.user.email || "",
    }));

    void loadRoleAndReports();
  }, [session?.user?.id]);

  const stats = useMemo(() => {
    const all = [...reports, ...myReports];
    return {
      active: all.filter((report) => report.status === "verified" || report.status === "matched").length,
      pending: all.filter((report) => report.status === "pending").length,
      resolved: all.filter((report) => report.status === "resolved").length,
    };
  }, [myReports, reports]);

  const signUrls = async (items: ItemReport[]): Promise<ReportWithImage[]> => {
    return Promise.all(
      items.map(async (report) => {
        if (!report.image_url) return report;
        const { data } = await supabase.storage.from("item-images").createSignedUrl(report.image_url, 3600);
        return { ...report, signedImageUrl: data?.signedUrl };
      }),
    );
  };

  const loadRoleAndReports = async () => {
    if (!session?.user) return;
    setLoadingReports(true);
    try {
      const [{ data: roleData }, { data: publicData }, { data: ownData }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" }),
        supabase
          .from("item_reports")
          .select("*")
          .in("status", ["verified", "matched", "resolved"])
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("item_reports").select("*").eq("user_id", session.user.id).order("created_at", { ascending: false }),
      ]);

      setIsAdmin(Boolean(roleData));
      setReports(await signUrls(publicData ?? []));
      setMyReports(await signUrls(ownData ?? []));

    } finally {
      setLoadingReports(false);
    }
  };

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault();
    setAuthLoading(true);
    try {
      const result =
        authMode === "signin"
          ? await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword })
          : await supabase.auth.signUp({
              email: authEmail.trim(),
              password: authPassword,
              options: { emailRedirectTo: window.location.origin, data: { display_name: authName.trim() } },
            });

      if (result.error) throw result.error;
      toast({ title: authMode === "signin" ? "Welcome back to ReclaimIt" : "Check your email", description: "Your ReclaimIt lost and found workspace is ready." });
    } catch (error) {
      toast({ title: "Authentication failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSubmitReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!session?.user) return;

    const parsed = reportSchema.safeParse(form);
    if (!parsed.success) {
      toast({ title: "Check the report details", description: "Please complete the required fields with valid information.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const reportId = crypto.randomUUID();
      let imagePath: string | null = null;

      if (imageFile) {
        if (!imageFile.type.startsWith("image/")) throw new Error("Please upload an image file.");
        if (imageFile.size > 5 * 1024 * 1024) throw new Error("Image must be smaller than 5MB.");
        const extension = imageFile.name.split(".").pop() || "jpg";
        imagePath = `${session.user.id}/${reportId}/item.${extension}`;
        const { error: uploadError } = await supabase.storage.from("item-images").upload(imagePath, imageFile, { upsert: true });
        if (uploadError) throw uploadError;
      }

      const { error } = await supabase.from("item_reports").insert({
        id: reportId,
        user_id: session.user.id,
        report_type: parsed.data.report_type,
        item_name: parsed.data.item_name,
        category: parsed.data.category,
        location: parsed.data.location,
        event_date: parsed.data.event_date || null,
        description: parsed.data.description,
        contact_name: parsed.data.contact_name,
        contact_phone: parsed.data.contact_phone || null,
        contact_email: parsed.data.contact_email || null,
        image_url: imagePath,
      });

      if (error) throw error;
      setForm(defaultReport);
      setImageFile(null);
      toast({ title: "Report submitted", description: "An admin can now verify it and add a solution." });
      await loadRoleAndReports();
    } catch (error) {
      toast({ title: "Report not submitted", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
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
              <h3 className="text-xl font-bold tracking-tight">{report.item_name}</h3>
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" aria-hidden="true" /> {report.location}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-bold capitalize ${statusStyles[report.status]}`}>{report.status}</span>
            </div>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{report.description}</p>
          {report.solution && (
            <div className="rounded-md border border-success/25 bg-success/10 p-3 text-sm text-success">
              <strong>Solution:</strong> {report.solution}
            </div>
          )}
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-muted-foreground">
            <span className="rounded-full bg-muted px-3 py-1">{report.category}</span>
            <span className="rounded-full bg-muted px-3 py-1">{report.event_date || "Date not specified"}</span>
            <span className="rounded-full bg-muted px-3 py-1">Contact: {report.contact_name}</span>
          </div>
        </div>
      </div>
    </article>
  );

  if (!session) {
    return (
      <main className="min-h-screen overflow-hidden bg-soft-gradient">
        <section className="container grid min-h-screen items-center gap-10 py-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="animate-fade-up space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border bg-surface px-4 py-2 text-sm font-semibold text-primary shadow-card">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Verified community recovery desk
            </div>
            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-black leading-tight tracking-tight md:text-7xl">Lost items get a clear path home.</h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Report lost or found items with photos, track verification, and let admins coordinate safe solutions from one trusted workspace.
              </p>
            </div>
            <div className="grid max-w-2xl gap-3 sm:grid-cols-3">
              {([
                [ArchiveRestore, "Report", "Lost or found"],
                [BadgeCheck, "Verify", "Admin checked"],
                [CheckCircle2, "Resolve", "Safe handoff"],
              ] satisfies Array<[LucideIcon, string, string]>).map(([Icon, title, label]) => (
                <div key={String(title)} className="rounded-lg border bg-card p-4 shadow-card transition-transform hover:-translate-y-1">
                  <Icon className="mb-4 h-6 w-6 text-primary" aria-hidden="true" />
                  <p className="font-bold">{String(title)}</p>
                  <p className="text-sm text-muted-foreground">{String(label)}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative animate-fade-up lg:justify-self-end">
            <div className="absolute -inset-6 -z-10 animate-float-map rounded-full bg-hero-gradient opacity-20 blur-3xl" />
            <form onSubmit={handleAuth} className="rounded-lg border bg-card p-6 shadow-soft">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black">{authMode === "signin" ? "Sign in" : "Create account"}</h2>
                  <p className="text-sm text-muted-foreground">Secure access is required for reports and images.</p>
                </div>
                <Sparkles className="h-7 w-7 text-secondary" aria-hidden="true" />
              </div>
              <div className="space-y-4">
                {authMode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="name">Display name</Label>
                    <Input id="name" value={authName} onChange={(event) => setAuthName(event.target.value)} required />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} minLength={8} required />
                </div>
                <Button variant="hero" size="lg" className="w-full" disabled={authLoading}>{authLoading ? "Working..." : authMode === "signin" ? "Sign in" : "Create account"}</Button>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}> 
                  {authMode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
                </Button>
              </div>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-surface/90 backdrop-blur">
        <div className="container flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-hero-gradient text-primary-foreground shadow-card">
              <Compass className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-primary">ReclaimIt</p>
              <h1 className="text-2xl font-black tracking-tight">Lost & Found Web Application</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
              <Button asChild variant="trust">
                <Link to="/admin"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Admin dashboard</Link>
              </Button>
            )}
            <Button variant="trust" onClick={signOut}><LogOut className="h-4 w-4" aria-hidden="true" /> Sign out</Button>
          </div>
        </div>
      </header>

      <section className="container py-8">
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          {([
            [Search, stats.active, "Active verified cases"],
            [Clock3, stats.pending, "Awaiting verification"],
            [ClipboardCheck, stats.resolved, "Resolved handoffs"],
          ] satisfies Array<[LucideIcon, number, string]>).map(([Icon, value, label]) => (
            <div key={String(label)} className="rounded-lg border bg-card p-5 shadow-card">
              <Icon className="mb-4 h-6 w-6 text-primary" aria-hidden="true" />
              <p className="text-3xl font-black">{String(value)}</p>
              <p className="text-sm text-muted-foreground">{String(label)}</p>
            </div>
          ))}
        </div>

        <Tabs defaultValue="report" className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-2 bg-muted p-1 md:w-auto">
            <TabsTrigger value="report">Report</TabsTrigger>
            <TabsTrigger value="browse">Browse</TabsTrigger>
          </TabsList>

          <TabsContent value="report" className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <form onSubmit={handleSubmitReport} className="rounded-lg border bg-card p-5 shadow-card">
              <div className="mb-5">
                <h2 className="text-2xl font-black">Report an item</h2>
                <p className="text-sm text-muted-foreground">Photos and clear locations help admins verify faster.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Report type</Label>
                  <Select value={form.report_type} onValueChange={(value: ReportType) => setForm({ ...form, report_type: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="lost">Lost</SelectItem><SelectItem value="found">Found</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })}>
                    <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
                    <SelectContent>{categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="item_name">Item name</Label>
                  <Input id="item_name" value={form.item_name} onChange={(event) => setForm({ ...form, item_name: event.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input id="location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event_date">Date</Label>
                  <Input id="event_date" type="date" value={form.event_date} onChange={(event) => setForm({ ...form, event_date: event.target.value })} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_name">Contact name</Label>
                  <Input id="contact_name" value={form.contact_name} onChange={(event) => setForm({ ...form, contact_name: event.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_phone">Contact phone</Label>
                  <Input id="contact_phone" value={form.contact_phone} onChange={(event) => setForm({ ...form, contact_phone: event.target.value })} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="contact_email">Contact email</Label>
                  <Input id="contact_email" type="email" value={form.contact_email} onChange={(event) => setForm({ ...form, contact_email: event.target.value })} />
                </div>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-surface-elevated p-6 text-center transition-colors hover:bg-muted md:col-span-2">
                  <ImagePlus className="h-8 w-8 text-primary" aria-hidden="true" />
                  <span className="font-bold">{imageFile ? imageFile.name : "Upload item image"}</span>
                  <span className="text-sm text-muted-foreground">PNG or JPG, up to 5MB</span>
                  <input type="file" accept="image/*" className="sr-only" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} />
                </label>
              </div>
              <Button variant="hero" size="lg" className="mt-5 w-full" disabled={submitting}>
                <UploadCloud className="h-4 w-4" aria-hidden="true" /> {submitting ? "Submitting..." : "Submit report"}
              </Button>
            </form>

            <div className="space-y-4">
              <h2 className="text-2xl font-black">My reports</h2>
              {loadingReports ? <p className="text-muted-foreground">Loading reports...</p> : myReports.length ? myReports.map((report) => renderReportCard(report)) : (
                <div className="rounded-lg border bg-card p-8 text-center shadow-card">
                  <ArchiveRestore className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden="true" />
                  <p className="font-bold">No reports yet</p>
                  <p className="text-sm text-muted-foreground">Submit your first lost or found item to start tracking it.</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="browse" className="space-y-4">
            <div>
              <h2 className="text-2xl font-black">Verified community reports</h2>
              <p className="text-sm text-muted-foreground">Only admin-verified reports appear here.</p>
            </div>
            {reports.length ? reports.map((report) => renderReportCard(report)) : (
              <div className="rounded-lg border bg-card p-8 text-center shadow-card">
                <Search className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden="true" />
                <p className="font-bold">No verified reports yet</p>
                <p className="text-sm text-muted-foreground">Admin-approved reports will appear here for safe matching.</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
};

export default Index;
