import type { ReactNode } from "react";
import { styled } from "next-yak";
import { Link, NavLink, Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useDataProvider } from "../data/DataProviderContext";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useCurrentFamily } from "../hooks/useFamily";
import { AvatarDot } from "./AvatarDot";
import { BottomNav } from "./BottomNav";
import { colors } from "../theme.yak";

const Page = styled.div`
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
  padding-top: max(16px, env(safe-area-inset-top, 0px));
  /* Reserve space for the sync-indicator and (on mobile) the bottom-nav. */
  padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
  @media (max-width: 600px) {
    padding: 12px;
    padding-top: max(12px, env(safe-area-inset-top, 0px));
    padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
  }
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  gap: 8px;
`;

const TitleBlock = styled.div`
  min-width: 0;
  flex: 1;
`;

const Title = styled.h1`
  font-size: 22px;
  margin: 0;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Sub = styled.div`
  font-size: 12px;
  color: ${colors.ink3};
  margin-top: 2px;
`;

const UserRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

const SignOutBtn = styled.button`
  background: transparent;
  border: 1px solid ${colors.line};
  border-radius: 8px;
  padding: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${colors.ink2};
  min-width: 36px;
  min-height: 36px;
  &:hover { background: ${colors.surface2}; }
`;

/**
 * Top-Tab-Bar — sichtbar ab Tablet-Breite; auf Mobile übernimmt
 * <BottomNav>. So bleibt Daumen-Reichweite gut, der Header schmal.
 */
const TabBar = styled.nav`
  display: flex;
  gap: 4px;
  border-bottom: 1px solid ${colors.line};
  margin: 12px -16px 0;
  padding: 0 16px;
  overflow-x: auto;
  @media (max-width: 600px) {
    display: none;
  }
`;

const TabLink = styled(NavLink)`
  padding: 10px 12px;
  color: ${colors.ink2};
  font-size: 14px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  text-decoration: none;
  white-space: nowrap;
  &.active {
    color: ${colors.primary};
    border-bottom-color: ${colors.primary};
    font-weight: 600;
  }
  &:hover {
    text-decoration: none;
  }
`;

const Main = styled.main`
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

export function AppShell({ children }: { children?: ReactNode }) {
  const provider = useDataProvider();
  const user = useCurrentUser();
  const family = useCurrentFamily();

  return (
    <>
      <Page>
        <Header>
          <TitleBlock>
            <Title>{family?.name ?? "Packliste"}</Title>
            {family && <Sub>Lokal in diesem Browser</Sub>}
          </TitleBlock>
          <UserRow>
            {user && <AvatarDot name={user.name} color={colors.primary} size={32} />}
            <SignOutBtn aria-label="Abmelden" onClick={() => provider.signOut()}>
              <LogOut size={16} />
            </SignOutBtn>
          </UserRow>
        </Header>
        <TabBar>
          <TabLink to="/" end>Trips</TabLink>
          <TabLink to="/vorlage">Vorlage</TabLink>
          <TabLink to="/familie">Familie</TabLink>
          <TabLink to="/info">Info</TabLink>
        </TabBar>
        <Main>{children ?? <Outlet />}</Main>
      </Page>
      <BottomNav />
    </>
  );
}

// Re-export for convenience
export { Link };
