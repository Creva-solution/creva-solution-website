<?php
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $firstname = $_POST['firstname'] ?? '';
    $lastname = $_POST['lastname'] ?? '';
    $email = $_POST['email'] ?? '';
    $message = $_POST['message'] ?? '';

    if (!empty($firstname) && !empty($lastname) && !empty($email) && !empty($message)) {
        // Check email format
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            echo '<script>alert("Invalid email format."); window.history.back();</script>';
            exit();
        }

        $host = "localhost";
        $dbUsername = "root";
        $dbPassword = "";
        $dbname = "crevasolution";

        $conn = new mysqli($host, $dbUsername, $dbPassword, $dbname);

        if ($conn->connect_error) {
            die('<script>alert("Database connection failed.");</script>');
        } else {
            $INSERT = "INSERT INTO contactform (firstname, lastname, email, message) VALUES (?, ?, ?, ?)";
            $stmt = $conn->prepare($INSERT);
            $stmt->bind_param("ssss", $firstname, $lastname, $email, $message);

            if ($stmt->execute()) {
                echo '<script>alert("Form submitted successfully!"); window.location.href = "contact.html";</script>';
            } else {
                echo '<script>alert("Error submitting form.");</script>';
            }

            $stmt->close();
            $conn->close();
        }
    } else {
        echo '<script>alert("All fields are required.");</script>';
    }
} else {
    echo '<script>alert("Invalid request method.");</script>';
}
?>
