import { useEffect, useState } from "react";
import { styled } from "next-yak";
import { Card, Stack, Row } from "../components/ui/Layout";
import { Button } from "../components/ui/Button";
import { Input, Field, FieldLabel, FieldHint } from "../components/ui/Input";
import { useDataProvider } from "../data/DataProviderContext";
import { colors } from "../theme.yak";

const Screen = styled.div`
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
`;

const Logo = styled.div`
  font-size: 56px;
  margin-bottom: 10px;
`;

const Title = styled.h1`
  font-size: 30px;
  margin: 0 0 6px;
  letter-spacing: -0.02em;
`;

const Sub = styled.p`
  margin: 0 0 24px;
  color: ${colors.ink2};
  max-width: 36ch;
`;

const Error = styled.div`
  color: ${colors.danger};
  font-size: 13px;
  background: ${colors.dangerSoft};
  border-radius: 8px;
  padding: 8px 10px;
`;

const ModeSwitch = styled.div`
  display: inline-flex;
  border: 1px solid ${colors.line};
  border-radius: 999px;
  overflow: hidden;
  background: ${colors.surface};
  margin-bottom: 6px;
`;

const ModeBtn = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  border: none;
  background: ${({ $active }) => ($active ? colors.primarySoft : "transparent")};
  color: ${({ $active }) => ($active ? colors.primaryInk : colors.ink2)};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  & + & { border-left: 1px solid ${colors.line}; }
`;

type Mode = "new" | "code";

const HASH_JOIN = /^#?\/?join\/([A-Z2-9]{6})$/i;

export function AuthGate() {
  const provider = useDataProvider();
  const [mode, setMode] = useState<Mode>("new");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "joining">("idle");

  // Auto-Join wenn die URL einen #/join/CODE-Hash hat
  useEffect(() => {
    const m = window.location.hash.match(HASH_JOIN);
    if (!m) return;
    const c = m[1].toUpperCase();
    setMode("code");
    setCode(c);
    setBusy("joining");
    (async () => {
      try {
        await provider.loadSharedSnapshot(c);
        provider.setSyncCode(c);
        // Hash entfernen, damit Reload nicht erneut auto-joined
        window.history.replaceState(null, "", window.location.pathname);
      } catch (e) {
        if (e instanceof Error) setErr((e as Error).message);
        else setErr(String(e));
        setBusy("idle");
      }
    })();
  }, [provider]);

  function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      provider.signIn(name, email);
    } catch (caught) {
      if (caught instanceof Error) setErr((caught as Error).message);
      else setErr(String(caught));
    }
  }

  async function submitCode() {
    const cleaned = code.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z2-9]{6}$/.test(cleaned)) {
      setErr("Code muss 6 Zeichen sein (A-Z, 2-9)");
      return;
    }
    setErr(null);
    setBusy("joining");
    try {
      await provider.loadSharedSnapshot(cleaned);
      provider.setSyncCode(cleaned);
    } catch (caught) {
      if (caught instanceof Error) setErr((caught as Error).message);
      else setErr(String(caught));
      setBusy("idle");
    }
  }

  return (
    <Screen>
      <Logo>🧳</Logo>
      <Title>Packliste</Title>
      <Sub>Für deine Familie. Lokal in diesem Browser.</Sub>

      <ModeSwitch>
        <ModeBtn type="button" $active={mode === "new"} onClick={() => { setMode("new"); setErr(null); }}>
          Neu anlegen
        </ModeBtn>
        <ModeBtn type="button" $active={mode === "code"} onClick={() => { setMode("code"); setErr(null); }}>
          Mit Code beitreten
        </ModeBtn>
      </ModeSwitch>

      <Card style={{ width: "100%", maxWidth: 360, textAlign: "left", marginTop: 8 }}>
        {mode === "new" ? (
          <form onSubmit={submitLogin}>
            <Stack $gap={10}>
              <Field>
                <FieldLabel>Dein Name</FieldLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="z.B. Sebastian"
                  autoComplete="name"
                  required
                />
              </Field>
              <Field>
                <FieldLabel>E-Mail</FieldLabel>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="du@example.com"
                  autoComplete="email"
                  required
                />
              </Field>
              {err && <Error>{err}</Error>}
              <Button type="submit" $block>Anmelden</Button>
              <FieldHint style={{ textAlign: "center" }}>
                Daten bleiben lokal. Per Code-Sync später auf anderen Browser übertragbar.
              </FieldHint>
            </Stack>
          </form>
        ) : (
          <Stack $gap={10}>
            <Field>
              <FieldLabel>6-stelliger Sync-Code</FieldLabel>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABC234"
                style={{ fontFamily: "ui-monospace, monospace", letterSpacing: "0.18em", textAlign: "center", fontSize: 22 }}
                onKeyDown={(e) => { if (e.key === "Enter") submitCode(); }}
                autoFocus
                disabled={busy === "joining"}
              />
            </Field>
            {err && <Error>{err}</Error>}
            <Button onClick={submitCode} disabled={code.length !== 6 || busy === "joining"} $block>
              {busy === "joining" ? "Hole Daten …" : "Beitreten"}
            </Button>
            <Row $gap={6} style={{ justifyContent: "center", flexWrap: "wrap" }}>
              <FieldHint>
                Code bekommst du auf dem anderen Browser unter Info → "Code erzeugen".
              </FieldHint>
            </Row>
          </Stack>
        )}
      </Card>
    </Screen>
  );
}
