import Link from "next/link";
import { Activity, ArrowRight, BrainCircuit, Database, RadioTower } from "lucide-react";
import { AppTopBar } from "@/components/app-top-bar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const MODES = [
  {
    href: "/collection",
    title: "Collection",
    description: "Run the motor-imagery protocol, emit LSL markers, and record synchronized EEG with LabRecorder.",
    icon: Activity,
  },
  {
    href: "/viewer",
    title: "Visualization",
    description: "Load XDF recordings, inspect channels, markers, timing, and signal quality.",
    icon: Database,
  },
  {
    href: "/inference",
    title: "Inference",
    description: "Classify recorded MI windows, review predictions, and send rover commands over Bluetooth.",
    icon: BrainCircuit,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <AppTopBar title="HELIN" subtitle="Control Center" maxWidthClassName="max-w-6xl">
        <RadioTower className="h-4 w-4 text-muted-foreground" />
      </AppTopBar>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold tracking-tight">Select Workspace</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Collection, signal review, and rover inference are separated so each workflow stays focused.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {MODES.map((mode) => {
            const Icon = mode.icon;
            return (
              <Card key={mode.href} className="gap-4 rounded-md py-4 transition-colors hover:bg-accent/30">
                <CardHeader className="px-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md border bg-background">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <CardTitle className="text-base">{mode.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-4">
                  <CardDescription className="leading-relaxed">{mode.description}</CardDescription>
                </CardContent>
                <CardFooter className="px-4">
                  <Button asChild size="sm" className="w-full">
                    <Link href={mode.href}>
                      Open
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
