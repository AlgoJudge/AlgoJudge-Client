import { FC, ReactNode, createContext, useContext, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export interface LoginModel {
    email: string,
    password: string
}

export interface User {
    email: string
}

export interface AuthContextType {
    user: User|null|undefined;
    login: (model: LoginModel) => void;
    logout: () => void;
}

const initialState: AuthContextType = {
    user: null,
    login: () => { },
    logout: () => { }
};
const AuthContext = createContext<AuthContextType>(initialState);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const redirectPath = location.state?.path || '/';
    const [user, setUser] = useState<User | null | undefined>(null);
    const login = (model: LoginModel) => {
        // TODO: tmp
        setUser({ email: model.email });
        navigate(redirectPath, { replace: true });
    }
    const logout = () => {
        // TODO
        setUser(null);
        navigate(redirectPath, { replace: true });
    }

    // Restoring the session from the Server is not wired up yet. Enabling it
    // also needs `useEffect` from react and `useSession` from ./SessionProvider:
    //
    // useEffect(() => {
    //     loginApi.getInfo().then(info => {
    //         setUser({ email: info.email });
    //         navigate(redirectPath, { replace: true });
    //     }).catch(() => setUser(null));
    // }, [])

    return (
        <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
    )
}

export const useAuth = () => {
    return useContext(AuthContext);
}