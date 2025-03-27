import { Button } from '@mantine/core';
import { Link } from "react-router-dom";

function ManagerPage() {
    return (
        <>
            <h1>Manager</h1>
            <Button size="xl" component={Link} to="/manager/users" m="md">Users</Button>
            <Button size="xl" component={Link} to="/manager/runners" m="md">Runners</Button>
        </>
    )
}

export default ManagerPage;