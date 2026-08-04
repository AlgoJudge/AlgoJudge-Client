import Header from './components/header/Header';
import Footer from './components/footer/Footer';
import { Outlet } from 'react-router-dom';
import { Container } from '@mantine/core';

function Layout() {
    return (
        <>
            {/* The provider lives above the router now, so both shells read one
                session instead of one each. */}
            <Header />
            <Container size={'lg'} my={40}>
                <Outlet />
            </Container>
            <Footer />
        </>
    );
}

export default Layout;