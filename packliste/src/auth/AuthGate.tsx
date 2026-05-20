import { useState } from "react";
import { styled } from "next-yak";
import { Card, Stack } from "../components/ui/Layout";
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

export function AuthGate() {
  const provider = useDataProvider();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      provider.signIn(name, email);
    } catch (caught) {
      const msg = caught instanceof Error ? (caught as Error).message : String(caught);
      setErr(msg);
    }
  }

  return (
    <Screen>
      <Logo>🧳</Logo>
      <Title>Packliste</Title>
      <Sub>Für deine Familie. Lokal in diesem Browser.</Sub>
      <Card style={{ width: "100%", maxWidth: 360, textAlign: "left" }}>
        <form onSubmit={submit}>
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
            <Button type="submit" $block>
              Anmelden
            </Button>
            <FieldHint style={{ textAlign: "center" }}>
              Daten bleiben in v1 nur lokal. Echte Anmeldung folgt.
            </FieldHint>
          </Stack>
        </form>
      </Card>
    </Screen>
  );
}
