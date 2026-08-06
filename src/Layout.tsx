import Header from './components/header/Header';
import Footer from './components/footer/Footer';
import { Outlet } from 'react-router-dom';
import { Center, Container, Loader } from '@mantine/core';
import { Suspense } from 'react';
import classes from './Layout.module.css';

function Layout() {
    return (
        <div className={classes.shell}>
            {/* The provider lives above the router now, so both shells read one
                session instead of one each. */}
            <Header />
            <div className={classes.content}>
                <Container size={'lg'} my={40}>
                    {/* The legal pages are split out, so the public shell needs a
                        boundary of its own — the application shell already has one. */}
                    <Suspense fallback={<Center my="xl"><Loader size="xl" /></Center>}>
                        <Outlet />
                    </Suspense>
                </Container>
            </div>
            <Footer />
        </div>
    );
}

export default Layout;
