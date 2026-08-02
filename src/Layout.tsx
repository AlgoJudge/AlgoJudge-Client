import Header from './components/header/Header';
import Footer from './components/footer/Footer';
import { Outlet } from 'react-router-dom';
import { Container } from '@mantine/core';
import { AuthProvider } from './provider/AuthProvider';

function Layout() {
    return (
        <>
            <AuthProvider>
                <Header />
                <Container size={'lg'} my={40}>
                    <Outlet />
                </Container>
                <Footer />
            </AuthProvider>
        </>
    );
}

export default Layout;