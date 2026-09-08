import { describe, expect, it } from "vitest";
import {
  istStaging,
  istStagingDeployment,
  istStagingHostname,
  STAGING_HOSTNAME,
  STAGING_URL,
} from "./staging";

const env = (ref?: string) =>
  ({ VERCEL_GIT_COMMIT_REF: ref }) as unknown as NodeJS.ProcessEnv;

describe("istStagingDeployment", () => {
  it("erkennt das Deployment des staging-Branches", () => {
    expect(istStagingDeployment(env("staging"))).toBe(true);
  });

  it("lässt Produktion und Feature-Branches unberührt", () => {
    expect(istStagingDeployment(env("main"))).toBe(false);
    expect(istStagingDeployment(env("staging-irgendwas"))).toBe(false);
    expect(istStagingDeployment(env(undefined))).toBe(false);
  });
});

describe("istStagingHostname", () => {
  it("erkennt die Staging-Domain", () => {
    expect(istStagingHostname(STAGING_HOSTNAME)).toBe(true);
  });

  it("erkennt Produktion nicht als Staging", () => {
    expect(istStagingHostname("app.strado.ch")).toBe(false);
    expect(istStagingHostname(null)).toBe(false);
  });

  // Eine fremde Domain, die den Staging-Namen bloss enthält, darf nicht
  // durchrutschen — sonst genügte staging.strado.ch.angreifer.example.
  it("verlangt den vollständigen Hostnamen", () => {
    expect(istStagingHostname("staging.strado.ch.angreifer.example")).toBe(false);
    expect(istStagingHostname("nicht-staging.strado.ch")).toBe(false);
  });
});

describe("istStaging", () => {
  // Der Kern der Nachbesserung: die Branch- und die Deployment-Adresse von
  // Vercel tragen nicht den Hostnamen staging.strado.ch, zeigen aber auf
  // dasselbe Deployment. Nur die Branch-Bedingung fängt sie ein.
  it("greift auch unter der Branch- und der Deployment-Adresse von Vercel", () => {
    expect(istStaging("strado-git-staging-jl-e520.vercel.app", env("staging"))).toBe(true);
    expect(istStaging("strado-abc123xyz-jl-e520.vercel.app", env("staging"))).toBe(true);
  });

  it("greift unter der Custom-Domain auch ohne Branch-Variable", () => {
    expect(istStaging(STAGING_HOSTNAME, env(undefined))).toBe(true);
  });

  it("lässt die Produktion in Ruhe", () => {
    expect(istStaging("app.strado.ch", env("main"))).toBe(false);
  });
});

describe("STAGING_URL", () => {
  it("ist https und zeigt auf den Staging-Hostnamen", () => {
    expect(STAGING_URL).toBe(`https://${STAGING_HOSTNAME}`);
  });
});
