import { styled } from "next-yak";
import { NavLink, useLocation } from "react-router-dom";
import { Backpack, ClipboardList, Users, Info } from "lucide-react";
import { colors } from "../theme.yak";

const Bar = styled.nav`
  display: none;
  @media (max-width: 600px) {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: ${colors.surface};
    border-top: 1px solid ${colors.line};
    padding: 6px 4px;
    padding-bottom: calc(6px + env(safe-area-inset-bottom, 0px));
    z-index: 40;
    justify-content: space-around;
    box-shadow: 0 -2px 12px rgba(20, 30, 50, 0.06);
  }
`;

const Tab = styled(NavLink)`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 600;
  color: ${colors.ink3};
  text-decoration: none;
  border-radius: 8px;
  min-height: 48px;
  &:hover { text-decoration: none; }
  &.active {
    color: ${colors.primary};
  }
`;

export function BottomNav() {
  const location = useLocation();
  // Hide bottom-nav while inside a trip detail to keep focus on the list
  if (location.pathname.startsWith("/trip/")) return null;

  return (
    <Bar>
      <Tab to="/" end>
        <Backpack size={20} />
        Trips
      </Tab>
      <Tab to="/vorlage">
        <ClipboardList size={20} />
        Vorlage
      </Tab>
      <Tab to="/familie">
        <Users size={20} />
        Familie
      </Tab>
      <Tab to="/info">
        <Info size={20} />
        Info
      </Tab>
    </Bar>
  );
}
