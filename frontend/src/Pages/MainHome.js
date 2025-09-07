import React, { useState } from "react";
import "../css/MainHome.css";

const MainHome = () => {
  const [hoveredFeature, setHoveredFeature] = useState(null);

  const features = [
    {
      id: 1,
      title: "Fast Setup",
      description: "Get your AI project running with React frontend and Node.js backend in minutes.",
      icon: "⚡",
    },
    {
      id: 2,
      title: "Scalable Architecture",
      description: "Built with scalability in mind, easily handle growing traffic and data with modern cloud solutions.",
      icon: "🚀",
    },
    {
      id: 3,
      title: "AI Ready",
      description: "Integrate AI models seamlessly and start building smart applications with pre-built components.",
      icon: "🤖",
    },
    {
      id: 4,
      title: "Real-time Processing",
      description: "Handle real-time data processing and live updates with WebSocket integration.",
      icon: "⚡",
    },
    {
      id: 5,
      title: "Secure & Reliable",
      description: "Enterprise-grade security with authentication, authorization, and data encryption.",
      icon: "🔒",
    },
    {
      id: 6,
      title: "Easy Deployment",
      description: "Deploy to cloud platforms with one-click deployment and CI/CD pipeline integration.",
      icon: "☁️",
    },
  ];

  // Always redirect to login page for any action that requires authentication
  const handleLoginRedirect = (targetPath = "/upload") => {
    // Always redirect to login with the target path as a continue parameter
    window.location.href = `/login?continue=${encodeURIComponent(targetPath)}`;
  };

  // Handle navigation clicks (like Features, About, etc.)
  const handleNavClick = (e, target) => {
    e.preventDefault();
    if (target.startsWith('#')) {
      // For anchor links, just scroll to section
      document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' });
    } else {
      // For other navigation, redirect to login
      handleLoginRedirect(target);
    }
  };

  return (
    <div className="main-container">
      {/* Navigation Bar */}
      <nav className="navbar">
        <div className="nav-container">
          <div className="logo">
            <h3 onClick={() => handleLoginRedirect("/dashboard")}>Techolution AI</h3>
          </div>
          <div className="nav-links">
            <a href="#features" onClick={(e) => handleNavClick(e, '#features')}>Features</a>
            <a href="/about" onClick={(e) => handleNavClick(e, '/about')}>About</a>
            <a href="/contact" onClick={(e) => handleNavClick(e, '/contact')}>Contact</a>
            <button className="nav-cta-btn" onClick={() => handleLoginRedirect("/upload")}>
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-text">
            <h1 className="hero-title">
              Welcome to <span className="gradient-text">Techolution AI</span>
            </h1>
            <p className="hero-subtitle">
              Build intelligent AI-driven solutions with our powerful React + Node.js platform. 
              Upload documents, process with AI, and generate insights in real-time.
            </p>
            <div className="hero-buttons">
              <button className="primary-btn" onClick={() => handleLoginRedirect("/upload")}>
                Get Started
              </button>
              <a href="#features" className="secondary-btn" onClick={(e) => handleNavClick(e, '#features')}>
                Learn More
              </a>
            </div>
          </div>
          <div className="hero-animation">
            <div className="floating-card" onClick={() => handleLoginRedirect("/dashboard")}>
              <div className="card-header">AI Processing</div>
              <div className="progress-bar">
                <div className="progress-fill"></div>
              </div>
              <div className="card-stats">
                <span>Documents: 1,247</span>
                <span>Accuracy: 98.5%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="section-container">
          <h2 className="section-title">Powerful Features</h2>
          <p className="section-subtitle">
            Everything you need to build, deploy, and scale your AI applications
          </p>
          
          <div className="features-grid">
            {features.map((feature) => (
              <div
                key={feature.id}
                className={`feature-card ${hoveredFeature === feature.id ? 'hovered' : ''}`}
                onMouseEnter={() => setHoveredFeature(feature.id)}
                onMouseLeave={() => setHoveredFeature(null)}
                onClick={() => handleLoginRedirect(`/features/${feature.id}`)}
              >
                <div className="feature-icon">{feature.icon}</div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section">
        <div className="section-container">
          <div className="stats-grid">
            <div className="stat-item" onClick={() => handleLoginRedirect("/analytics")}>
              <h3>10K+</h3>
              <p>Documents Processed</p>
            </div>
            <div className="stat-item" onClick={() => handleLoginRedirect("/status")}>
              <h3>99.9%</h3>
              <p>Uptime Guarantee</p>
            </div>
            <div className="stat-item" onClick={() => handleLoginRedirect("/customers")}>
              <h3>500+</h3>
              <p>Happy Customers</p>
            </div>
            <div className="stat-item" onClick={() => handleLoginRedirect("/support")}>
              <h3>24/7</h3>
              <p>Support Available</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-container">
          <h2>Ready to Transform Your Workflow?</h2>
          <p>Join thousands of developers building the future with AI</p>
          <button className="cta-button" onClick={() => handleLoginRedirect("/signup")}>
            Start Building Today
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-content">
            <div className="footer-section">
              <h4 onClick={() => handleLoginRedirect("/dashboard")}>Techolution AI</h4>
              <p>Building the future of AI-powered applications</p>
            </div>
            <div className="footer-section">
              <h4>Product</h4>
              <ul>
                <li><a href="#features" onClick={(e) => handleNavClick(e, '#features')}>Features</a></li>
                <li><a href="/pricing" onClick={(e) => handleNavClick(e, '/pricing')}>Pricing</a></li>
                <li><a href="/docs" onClick={(e) => handleNavClick(e, '/docs')}>Documentation</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Company</h4>
              <ul>
                <li><a href="/about" onClick={(e) => handleNavClick(e, '/about')}>About</a></li>
                <li><a href="/careers" onClick={(e) => handleNavClick(e, '/careers')}>Careers</a></li>
                <li><a href="/contact" onClick={(e) => handleNavClick(e, '/contact')}>Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} Techolution AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MainHome;