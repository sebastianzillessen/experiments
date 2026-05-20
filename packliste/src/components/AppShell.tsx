import type { ReactNode } from "react";
import { styled } from "next-yak";
import { Link, useLocation, NavLink, Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useDataProvider } from "../data/DataProviderContext";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { useCurrentFamily } from "../hooks/useFamily";
import { AvatarDot } from "./AvatarDot";
import { colors } from "../theme.yak";

const Page = styled.div`
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
  padding-bottom: 80px;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
`;

const Title = styled.h1`
  font-size: 22px;
  margin: 0;
  letter-spacing: -0.01em;
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
`;

const SignOutBtn = styled.button`
  background: transparent;
  border: 1px solid ${colors.line};
  border-radius: 8px;
  padding: 6px;
  display: inline-flex;
  align-items: center;
  color: ${colors.ink2};
  &:hover { background: ${colors.surface2}; }
`;

const TabBar = styled.nav`
  display: flex;
  gap: 4px;
  border-bottom: 1px solid ${colors.line};
  margin: 12px -16px 0;
  padding: 0 16px;
  overflow-x: auto;
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
  const location = useLocation();
  const onTripDetail = location.pathname.startsWith("/trip/");

  return (
    <Page>
      <Header>
        <div>
          <Title>{family?.name ?? "Packliste"}</Title>
          {family && <Sub>Lokal in diesem Browser</Sub>}
        </div>
        <UserRow>
          {user && <AvatarDot name={user.name} color={colors.primary} size={32} />}
          <SignOutBtn aria-label="Abmelden" onClick={() => provider.signOut()}>
            <LogOut size={16} />
          </SignOutBtn>
        </UserRow>
      </Header>
      {!onTripDetail && (
        <TabBar>
          <TabLink to="/" end>Trips</TabLink>
          <TabLink to="/vorlage">Vorlage</TabLink>
          <TabLink to="/familie">Familie</TabLink>
          <TabLink to="/info">Info</TabLink>
        </TabBar>
      )}
      <Main>{children ?? <Outlet />}</Main>
    </Page>
  );
}

// Re-export for convenience
export { Link };
