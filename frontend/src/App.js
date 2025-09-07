import React from "react";
import { BrowserRouter, Routes, Route} from "react-router-dom";
import MainHome from "./Pages/MainHome";
import Login from "./Pages/Login";
import Signup from "./Pages/Signup";
import HomeScreen from "./Pages/HomeScreen";
function App() {
  return (
    <BrowserRouter>
      <div>
        <Routes>
          <Route path="/" element={<MainHome />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/home" element={<HomeScreen />} />



        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
